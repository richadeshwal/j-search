const { getAccessToken } = require("./gmailAuth");
const { isGtaLocation } = require("./jsearch");

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
// LinkedIn's own job-alert and job-recommendation senders.
const SEARCH_QUERY = "from:(jobalerts-noreply@linkedin.com OR jobs-noreply@linkedin.com) newer_than:2d";

function base64UrlDecode(data) {
  return Buffer.from(data, "base64url").toString("utf8");
}

// Gmail messages are a tree of MIME parts; find the first text/plain leaf.
function findPlainTextPart(payload) {
  if (!payload) return null;
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const found = findPlainTextPart(part);
    if (found) return found;
  }
  // Single-part messages carry the body directly on the payload.
  if (!payload.parts && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  return null;
}

async function gmailFetch(path, accessToken) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail API request failed: ${res.status} ${body}`);
  }
  return res.json();
}

// LinkedIn digest emails list jobs as repeating text blocks, each ending in
// a "View job: <url>" line, preceded by Title / Company / Location and
// optional metadata lines ("N connections", "This company is actively
// hiring", "Apply with resume & profile"). This walks backward from each
// "View job:" line to pull out the three real content lines.
const METADATA_LINE = /^(\d+ (connection|company alumnus|company alumni)s?|this company is actively hiring|apply with resume & profile)$/i;

function parseJobBlocks(plainText, emailDate) {
  const lines = plainText.split("\n").map((l) => l.trim());
  const jobs = [];

  lines.forEach((line, i) => {
    const match = line.match(/View job:\s*(https:\/\/www\.linkedin\.com\/comm\/jobs\/view\/(\d+)[^\s]*)/);
    if (!match) return;

    const collected = [];
    for (let j = i - 1; j >= 0 && collected.length < 3; j--) {
      const candidate = lines[j];
      if (!candidate || METADATA_LINE.test(candidate)) continue;
      collected.unshift(candidate);
    }
    if (collected.length < 2) return; // not enough to make a real job entry

    const [title, company, location] = collected.length === 3
      ? collected
      : [collected[0], collected[1], ""];

    jobs.push({
      id: `linkedin_email_${match[2]}`,
      title,
      company: company || "Unknown company",
      location: location || "Unknown",
      applyLink: match[1],
      postedAt: emailDate,
    });
  });

  return jobs;
}

function normalizeEmailJob(raw) {
  const text = `${raw.title} ${raw.location}`.toLowerCase();
  const isRemote = /\bremote\b|\banywhere\b/.test(text);
  const isGta = isGtaLocation(raw.location);
  const isContract = /\bcontract\b|\btemp(orary)?\b/i.test(raw.title);

  if (!((isRemote || isGta) && !isContract)) return null;

  return {
    id: raw.id,
    title: raw.title,
    matchedTitle: null,
    matchedQuery: "linkedin_email",
    company: raw.company,
    location: raw.location,
    isRemote,
    isGta,
    isLikelyHybrid: false,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    meetsSalaryTarget: false,
    postedAt: raw.postedAt,
    source: "LinkedIn (email alert)",
    applyLink: raw.applyLink,
    score: isRemote ? 2 : 0,
  };
}

// Fetches LinkedIn job-alert/recommendation emails from the last 48h and
// returns normalized, filtered job records (same shape as JSearch jobs).
// Note: LinkedIn's plain-text digest doesn't reliably expose employment
// type, so contract detection here only catches "Contract"/"Temp" appearing
// literally in the job title — weaker than the JSearch-sourced filter.
async function fetchLinkedInEmailJobs() {
  const accessToken = await getAccessToken();
  const list = await gmailFetch(`/messages?q=${encodeURIComponent(SEARCH_QUERY)}&maxResults=50`, accessToken);
  const messageRefs = list.messages || [];

  const jobs = [];
  let rawCount = 0;

  for (const ref of messageRefs) {
    const msg = await gmailFetch(`/messages/${ref.id}?format=full`, accessToken);
    const plainText = findPlainTextPart(msg.payload);
    if (!plainText) continue;

    const emailDate = new Date(Number(msg.internalDate)).toISOString();
    const rawJobs = parseJobBlocks(plainText, emailDate);
    rawCount += rawJobs.length;

    for (const raw of rawJobs) {
      const job = normalizeEmailJob(raw);
      if (job) jobs.push(job);
    }
  }

  return { jobs, rawCount, emailCount: messageRefs.length };
}

module.exports = { fetchLinkedInEmailJobs, parseJobBlocks, normalizeEmailJob };
