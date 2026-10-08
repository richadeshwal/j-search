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

const SALARY_TARGET = 150000;
const SALARY_FLOOR = 160000; // hard cutoff — jobs with a confirmed salary below this are excluded entirely
const JSEARCH_HOST = "jsearch.p.rapidapi.com";

// Title relevance gate: JSearch's semantic search and the user's own
// LinkedIn alert searches both surface "adjacent" roles under these
// queries — e.g. "Senior Manager, AI Enablement", "Data Science Manager",
// "Value Stream Owner, Technology" — that have nothing to do with product
// or project management. Require the job title itself to actually say so.
const TITLE_RELEVANCE_REGEX = /\b(product|project|program|technical\s+program)\s+managers?\b|\bproduct\s+owners?\b|\btpm\b|\bpm\b/i;

function isRelevantTitle(title) {
  return TITLE_RELEVANCE_REGEX.test(title || "");
}

// AI/ML relevance gate: a PM-titled role isn't necessarily AI-related work
// (e.g. a generic fintech "Senior Product Manager" posting). Checks title
// first, then description when available (JSearch jobs only — LinkedIn
// email-sourced jobs have no description, so they're title-only and will
// miss AI-branded-but-not-AI-worded roles, e.g. a product literally named
// "Falcon Writer" with no "AI"/"ML" keyword anywhere in the title).
const AI_RELATED_REGEX = /\b(ai|ml)\b|artificial intelligence|machine learning|generative ai|gen-?ai\b|large language model|\bllm\b|\bagentic\b|\bnlp\b|deep learning|neural network/i;

function isAiRelated(title, description) {
  if (AI_RELATED_REGEX.test(title || "")) return true;
  if (description && AI_RELATED_REGEX.test(description)) return true;
  return false;
}

// Entry-level exclusion: a PM-titled posting that explicitly calls itself
// entry-level/junior/new-grad isn't a fit regardless of the AI/salary
// signals. Checks title first, then description when available.
const ENTRY_LEVEL_REGEX = /\bentry[\s-]?level\b|\bnew\s?grad(uate)?\b|\bjunior\b|\bintern(ship)?\b/i;

function isEntryLevel(title, description) {
  if (ENTRY_LEVEL_REGEX.test(title || "")) return true;
  if (description && ENTRY_LEVEL_REGEX.test(description)) return true;
  return false;
}

// Best-effort industry classifier. JSearch exposes no industry field, so
// this infers one from the employer name (available for every job) and
// falls back to the job description (JSearch jobs only) when the name
// doesn't match anything. Order matters — first match wins — and
// "Technology / Software" is the catch-all, since most roles here are
// tech companies at their core regardless of which vertical they serve.
const INDUSTRY_RULES = [
  { industry: "Financial Services", pattern: /\b(bank|banking|financial|capital|invest|insurance|fintech|trading|asset management|wealth|credit union|TD|BMO|CIBC|RBC|Scotiabank|Citi(bank)?|JPMorgan|Goldman Sachs|Manulife|Sun Life|Questrade|WEX|Interac|PayPal|Stripe|Visa|Mastercard|American Express)\b/i },
  { industry: "Healthcare & Life Sciences", pattern: /\b(health|hospital|clinical|pharma|biotech|life sciences|medical|McKesson|Veeva)\b/i },
  { industry: "Telecommunications", pattern: /\b(telecom|wireless|Rogers Communications|Bell Canada|Telus|AT&T|Verizon)\b/i },
  { industry: "Travel & Transportation", pattern: /\b(airline|airways|aviation|logistics|transport|United Airlines|Air Canada|WestJet|Uber|Lyft)\b/i },
  { industry: "Retail & E-commerce", pattern: /\b(retail|e-?commerce|marketplace|eBay|Amazon|Walmart|Shopify)\b/i },
  { industry: "Media & Advertising", pattern: /\b(media|advertising|adtech|marketing agency|Omnicom)\b/i },
  { industry: "Consulting & IT Staffing", pattern: /\b(consulting|staffing|professional services|Accenture|Deloitte|PwC|\bEY\b|KPMG|TEKsystems|Turing\b)\b/i },
  { industry: "Government & Public Sector", pattern: /\b(government|municipal|city of|province of|federal|public sector|\.gov\b)\b/i },
  { industry: "Education", pattern: /\b(university|college|school board|education)\b/i },
];

function classifyIndustry(company, description) {
  for (const { industry, pattern } of INDUSTRY_RULES) {
    if (pattern.test(company || "")) return industry;
  }
  if (description) {
    for (const { industry, pattern } of INDUSTRY_RULES) {
      if (pattern.test(description)) return industry;
    }
  }
  return "Technology / Software";
}

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

  const employmentTypes = raw.job_employment_types || (raw.job_employment_type ? [raw.job_employment_type] : []);
  const isContract = employmentTypes.some((t) => /contract|temp/i.test(t));

  const salaryMin = annualizeSalary(raw.job_min_salary, raw.job_salary_period);
  const salaryMax = annualizeSalary(raw.job_max_salary, raw.job_salary_period);
  const salaryHigh = salaryMax ?? salaryMin ?? null;
  const meetsSalaryTarget = salaryHigh != null && salaryHigh >= SALARY_TARGET;
  // Hard cutoff: exclude a job only when salary is actually reported and
  // confirmed below the floor. Most postings don't list salary at all —
  // excluding every one of those too would gut the list almost entirely,
  // so an unlisted salary still passes.
  const meetsSalaryFloor = salaryHigh == null || salaryHigh >= SALARY_FLOOR;

  // Safety net: `date_posted=week` is a request param, not a guarantee —
  // some publishers (seen from "Ai-Search.io") report stale listings
  // anyway. Independently re-check the actual posted timestamp when
  // JSearch gives us one; a job with no timestamp at all still passes
  // (can't confirm either way, and most results do include one).
  const postedAtRaw = raw.job_posted_at_datetime_utc || null;
  if (postedAtRaw) {
    const postedTime = new Date(postedAtRaw).getTime();
    if (!Number.isNaN(postedTime) && Date.now() - postedTime > 7 * 24 * 60 * 60 * 1000) {
      return null;
    }
  }

  // Hard filter: only remote jobs, or jobs located in the Greater Toronto
  // Area (JSearch has no reliable "hybrid" field, so any GTA-located job
  // is treated as a candidate here; `isLikelyHybrid` below is just a label).
  // Contract/temporary postings are excluded — permanent roles only. A job
  // with no employment type reported at all is kept (can't confirm either way).
  // Title must actually say Product/Project/Program Manager (or Product
  // Owner/TPM) — the search query text alone doesn't stop Google Jobs from
  // surfacing adjacent-but-different roles (e.g. "Data Science Manager").
  // Must also be genuinely AI/ML-related (title or description) — a PM
  // title alone doesn't guarantee that, e.g. a generic fintech PM posting.
  // Entry-level/junior/new-grad/intern postings are excluded outright.
  const qualifies =
    (isRemote || isGta) &&
    !isContract &&
    isRelevantTitle(raw.job_title) &&
    isAiRelated(raw.job_title, description) &&
    !isEntryLevel(raw.job_title, description) &&
    meetsSalaryFloor;
  if (!qualifies) return null;

  const score =
    (isRemote ? 2 : 0) +
    (meetsSalaryTarget ? 2 : 0) +
    (isGta && mentionsHybrid ? 1 : 0);

  return {
    id: makeJobId(raw),
    title: raw.job_title || queryTitle,
    matchedTitle: queryTitle,
    matchedQuery: raw.__matchedQuery || "unknown",
    company: raw.employer_name || "Unknown company",
    location: location || (isRemote ? "Remote" : "Unknown"),
    isRemote,
    isGta,
    isLikelyHybrid: isGta && mentionsHybrid && !isRemote,
    industry: classifyIndustry(raw.employer_name, description),
    description: description || null,
    employmentType: raw.job_employment_type || null,
    salaryMin: salaryMin ?? null,
    salaryMax: salaryMax ?? null,
    salaryCurrency: raw.job_salary_currency || null,
    meetsSalaryTarget,
    postedAt: postedAtRaw,
    source: raw.job_publisher || "Unknown",
    applyLink: raw.job_apply_link || raw.job_google_link || null,
    score,
  };
}

async function runQuery(query, apiKey) {
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
    throw new Error(`JSearch request failed for "${query}": ${res.status} ${body}`);
  }

  const json = await res.json();
  // /search-v2 nests results one level deeper than the old /search endpoint:
  // { status, data: { jobs: [...], cursor } } rather than { data: [...] }.
  return Array.isArray(json?.data?.jobs) ? json.data.jobs : [];
}

// Previously ran a second, unanchored "<title> jobs" pass to catch remote
// postings, plus this Toronto-anchored one for GTA postings. A real fetch
// showed the unanchored pass qualifying only 2/40 results (5%) against this
// app's remote-or-GTA filter, vs. 38/40 (95%) for the Toronto-anchored one —
// not worth doubling the JSearch request budget for, so only this pass runs
// now. (JSearch's free tier caps at 200 requests/month; this keeps daily
// usage to 4 requests/day ≈ 120/month.)
async function fetchTitleFromApi(title, apiKey) {
  const toronto = await runQuery(`${title} jobs in Toronto, Ontario, Canada`, apiKey);
  toronto.forEach((item) => { item.__matchedQuery = "toronto"; });
  return toronto;
}

// Fetches all configured job titles, normalizes + filters + dedupes results.
async function fetchAllJobs(apiKey) {
  if (!apiKey) {
    throw new Error("Missing RAPIDAPI_KEY");
  }

  const byId = new Map();
  const errors = [];
  const rawCounts = {};

  for (const title of JOB_TITLES) {
    try {
      const raw = await fetchTitleFromApi(title, apiKey);
      rawCounts[title] = { raw: raw.length, qualified: 0 };
      for (const item of raw) {
        const job = normalizeJob(item, title);
        if (!job) continue;
        rawCounts[title].qualified += 1;
        // Keep the highest-scoring match if the same job matched multiple titles.
        const existing = byId.get(job.id);
        if (!existing || job.score > existing.score) {
          byId.set(job.id, job);
        }
      }
    } catch (err) {
      rawCounts[title] = { raw: 0, qualified: 0 };
      errors.push(String(err.message || err));
    }
  }

  const jobs = Array.from(byId.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const bTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    return bTime - aTime;
  });

  return { jobs, errors, rawCounts };
}

module.exports = {
  JOB_TITLES,
  GTA_LOCATIONS,
  SALARY_TARGET,
  SALARY_FLOOR,
  annualizeSalary,
  isGtaLocation,
  isRelevantTitle,
  isAiRelated,
  isEntryLevel,
  classifyIndustry,
  normalizeJob,
  fetchAllJobs,
};
