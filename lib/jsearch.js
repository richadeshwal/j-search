// Core logic for querying JSearch (RapidAPI) and turning raw results into
// the normalized job records this app stores and renders.

const JOB_TITLES = [
  "AI Product Manager",
  "AI Project Manager",
  "ML Product Manager",
  "PM for AI",
];

const GTA_LOCATIONS = [
  "toronto",
  "mississauga",
  "brampton",
  "markham",
  "vaughan",
  "richmond hill",
  "oakville",
  "burlington",
  "ajax",
  "pickering",
  "whitby",
  "oshawa",
  "milton",
  "newmarket",
  "aurora",
  "etobicoke",
  "scarborough",
  "north york",
  "east york",
  "greater toronto",
  "gta",
];

const SALARY_TARGET = 160000;
const JSEARCH_HOST = "jsearch.p.rapidapi.com";

function annualizeSalary(amount, period) {
  if (amount == null) return null;
  switch ((period || "").toUpperCase()) {
    case "HOUR":
      return amount * 2080; // 40hrs/week * 52 weeks
    case "MONTH":
      return amount * 12;
    case "WEEK":
      return amount * 52;
    case "DAY":
      return amount * 260;
    default:
      return amount; // assume already annual (YEAR or unspecified)
  }
}

function isGtaLocation(text) {
  const t = (text || "").toLowerCase();
  return GTA_LOCATIONS.some((loc) => t.includes(loc));
}

function makeJobId(raw) {
  if (raw.job_id) return `jsearch_${raw.job_id}`;
  // Fallback: derive a stable-ish id from the apply link.
  const link = raw.job_apply_link || raw.job_google_link || `${raw.job_title}-${raw.employer_name}`;
  let hash = 0;
  for (let i = 0; i < link.length; i++) {
    hash = (hash * 31 + link.charCodeAt(i)) | 0;
  }
  return `fallback_${Math.abs(hash)}`;
}

// Normalizes one raw JSearch result into our job record shape, or returns
// null if it doesn't pass the remote-or-Toronto qualification filter.
function normalizeJob(raw, queryTitle) {
  const location = [raw.job_city, raw.job_state, raw.job_country]
    .filter(Boolean)
    .join(", ");
  const description = raw.job_description || "";

  const isRemote = raw.job_is_remote === true;
  const isGta = isGtaLocation(location) || isGtaLocation(raw.job_country);
  const mentionsHybrid = /\bhybrid\b/i.test(description) || /\bhybrid\b/i.test(raw.job_employment_type || "");

  // Hard filter: only remote jobs, or jobs located in the Greater Toronto
  // Area (JSearch has no reliable "hybrid" field, so any GTA-located job
  // is treated as a candidate here; `isLikelyHybrid` below is just a label).
  const qualifies = isRemote || isGta;
  if (!qualifies) return null;

  const salaryMin = annualizeSalary(raw.job_min_salary, raw.job_salary_period);
  const salaryMax = annualizeSalary(raw.job_max_salary, raw.job_salary_period);
  const salaryHigh = salaryMax ?? salaryMin ?? null;
  const meetsSalaryTarget = salaryHigh != null && salaryHigh >= SALARY_TARGET;

  const score =
    (isRemote ? 2 : 0) +
    (meetsSalaryTarget ? 2 : 0) +
    (isGta && mentionsHybrid ? 1 : 0);

  return {
    id: makeJobId(raw),
    title: raw.job_title || queryTitle,
    matchedTitle: queryTitle,
    company: raw.employer_name || "Unknown company",
    location: location || (isRemote ? "Remote" : "Unknown"),
    isRemote,
    isGta,
    isLikelyHybrid: isGta && mentionsHybrid && !isRemote,
    salaryMin: salaryMin ?? null,
    salaryMax: salaryMax ?? null,
    salaryCurrency: raw.job_salary_currency || null,
    meetsSalaryTarget,
    postedAt: raw.job_posted_at_datetime_utc || null,
    source: raw.job_publisher || "Unknown",
    applyLink: raw.job_apply_link || raw.job_google_link || null,
    score,
  };
}

async function fetchTitleFromApi(title, apiKey) {
  const query = `${title} jobs, remote or hybrid in Toronto Ontario Canada`;
  // RapidAPI's JSearch listing now routes its "Search" endpoint through
  // /search-v2 (the plain /search path 404s), per the current code snippet
  // on the Endpoints tab.
  const url = new URL(`https://${JSEARCH_HOST}/search-v2`);
  url.searchParams.set("query", query);
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "week");

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": JSEARCH_HOST,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`JSearch request failed for "${title}": ${res.status} ${body}`);
  }

  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

// Fetches all configured job titles, normalizes + filters + dedupes results.
async function fetchAllJobs(apiKey) {
  if (!apiKey) {
    throw new Error("Missing RAPIDAPI_KEY");
  }

  const byId = new Map();
  const errors = [];

  for (const title of JOB_TITLES) {
    try {
      const raw = await fetchTitleFromApi(title, apiKey);
      for (const item of raw) {
        const job = normalizeJob(item, title);
        if (!job) continue;
        // Keep the highest-scoring match if the same job matched multiple titles.
        const existing = byId.get(job.id);
        if (!existing || job.score > existing.score) {
          byId.set(job.id, job);
        }
      }
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }

  const jobs = Array.from(byId.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const bTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    return bTime - aTime;
  });

  return { jobs, errors };
}

module.exports = {
  JOB_TITLES,
  GTA_LOCATIONS,
  SALARY_TARGET,
  annualizeSalary,
  isGtaLocation,
  normalizeJob,
  fetchAllJobs,
};
