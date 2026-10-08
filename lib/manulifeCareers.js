const { isGtaLocation, isRelevantTitle, isEntryLevel, classifyIndustry } = require("./jsearch");

// Manulife's own Workday-hosted careers site. This calls Workday's
// (undocumented but widely used) CXS job-search JSON endpoint directly —
// same approach most job aggregators use for Workday-hosted career pages.
// Unlike JSearch/LinkedIn-email, Manulife results skip the AI-relevance
// gate by design (the user wants *any* PM role at this specific employer,
// not just AI-themed ones) but still require remote-or-GTA + a PM title.
const TENANT = "manulife";
const SITE = "MFCJH_Jobs";
const SEARCH_URL = `https://${TENANT}.wd3.myworkdayjobs.com/wday/cxs/${TENANT}/${SITE}/jobs`;
const CAREERS_BASE = `https://${TENANT}.wd3.myworkdayjobs.com/${SITE}`;

// Workday's list view gives a relative string like "Posted Today",
// "Posted 3 Days Ago", or "Posted 30+ Days Ago" instead of a real
// timestamp. Parse what we can; "30+" and anything unparseable is
// treated as too old rather than guessed at.
function parsePostedOn(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes("today")) return new Date().toISOString();
  if (lower.includes("yesterday")) return new Date(Date.now() - 86400000).toISOString();
  const match = lower.match(/(\d+)\s*\+?\s*day/);
  if (match && !lower.includes("30+")) {
    const days = parseInt(match[1], 10);
    return new Date(Date.now() - days * 86400000).toISOString();
  }
  return null;
}

function isWithinLastWeek(postedAt) {
  if (!postedAt) return false; // unparseable/30+ days — exclude rather than guess
  return Date.now() - new Date(postedAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function makeJobId(posting) {
  const key = posting.externalPath || posting.title || "unknown";
  return `manulife_${key.replace(/[^a-zA-Z0-9]+/g, "_")}`;
}

function normalizeManulifeJob(posting) {
  const title = posting.title || "";
  const location = posting.locationsText || "Unknown";
  const postedAt = parsePostedOn(posting.postedOn);

  const isRemote = /\bremote\b/i.test(location);
  const isGta = isGtaLocation(location);

  if (!isWithinLastWeek(postedAt)) return null;
  if (!((isRemote || isGta) && isRelevantTitle(title) && !isEntryLevel(title))) return null;

  return {
    id: makeJobId(posting),
    title,
    matchedTitle: null,
    matchedQuery: "manulife_careers",
    company: "Manulife",
    location,
    isRemote,
    isGta,
    isLikelyHybrid: false,
    industry: classifyIndustry("Manulife", null),
    description: null,
    employmentType: null, // not exposed at list level — kept, can't confirm either way
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    meetsSalaryTarget: false,
    postedAt,
    source: "Manulife Careers",
    applyLink: posting.externalPath ? `${CAREERS_BASE}${posting.externalPath}` : CAREERS_BASE,
    score: isRemote ? 2 : 0,
  };
}

async function fetchManulifeJobs() {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "Product Manager" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Manulife careers search failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  const postings = Array.isArray(json.jobPostings) ? json.jobPostings : [];

  const jobs = [];
  for (const posting of postings) {
    const job = normalizeManulifeJob(posting);
    if (job) jobs.push(job);
  }

  return { jobs, rawCount: postings.length };
}

module.exports = { fetchManulifeJobs, normalizeManulifeJob, parsePostedOn };
