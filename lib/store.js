const { Redis } = require("@upstash/redis");

// Vercel's KV integration and the Upstash Marketplace integration both land
// on a REST-based Redis store, but populate slightly different env var
// names depending on how it was connected — support both.
const kv = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY_CURRENT_JOBS = "jobs:current";
const KEY_GENERATED_AT = "jobs:generated_at";
const KEY_FETCH_ERRORS = "jobs:fetch_errors";
const KEY_DISCARDED = "jobs:discarded"; // set of job ids
const KEY_APPLIED = "jobs:applied"; // hash of id -> JSON job snapshot + appliedAt

async function saveFetchResult(jobs, errors) {
  await kv.set(KEY_CURRENT_JOBS, jobs);
  await kv.set(KEY_GENERATED_AT, new Date().toISOString());
  await kv.set(KEY_FETCH_ERRORS, errors);
}

async function getState() {
  const [current, generatedAt, errors, discardedIds, appliedMap] = await Promise.all([
    kv.get(KEY_CURRENT_JOBS),
    kv.get(KEY_GENERATED_AT),
    kv.get(KEY_FETCH_ERRORS),
    kv.smembers(KEY_DISCARDED),
    kv.hgetall(KEY_APPLIED),
  ]);

  const discardedSet = new Set(discardedIds || []);
  const appliedJobs = Object.values(appliedMap || {})
    .map((v) => (typeof v === "string" ? JSON.parse(v) : v))
    .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
  const appliedIds = new Set(appliedJobs.map((j) => j.id));

  const jobs = current || [];
  const newJobs = jobs.filter((j) => !discardedSet.has(j.id) && !appliedIds.has(j.id));
  const gtaJobs = newJobs.filter((j) => j.isGta);
  const discardedJobs = jobs.filter((j) => discardedSet.has(j.id) && !appliedIds.has(j.id));

  return {
    generatedAt: generatedAt || null,
    fetchErrors: errors || [],
    newJobs,
    gtaJobs,
    appliedJobs,
    discardedJobs,
  };
}

async function discardJob(id) {
  await kv.sadd(KEY_DISCARDED, id);
}

async function undiscardJob(id) {
  await kv.srem(KEY_DISCARDED, id);
}

async function applyJob(job) {
  const snapshot = { ...job, appliedAt: new Date().toISOString() };
  await kv.hset(KEY_APPLIED, { [job.id]: JSON.stringify(snapshot) });
  // A job that's applied to shouldn't also linger in the discarded set.
  await kv.srem(KEY_DISCARDED, job.id);
}

async function unapplyJob(id) {
  await kv.hdel(KEY_APPLIED, id);
}

module.exports = {
  saveFetchResult,
  getState,
  discardJob,
  undiscardJob,
  applyJob,
  unapplyJob,
};
