// Quick local sanity check for the JSearch integration, without touching
// Vercel KV. Usage:
//   RAPIDAPI_KEY=xxxx node scripts/test-fetch.js
// or with a .env file:
//   node --env-file=.env scripts/test-fetch.js

const { fetchAllJobs } = require("../lib/jsearch");

async function main() {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    console.error("Set RAPIDAPI_KEY in your environment first.");
    process.exit(1);
  }

  const { jobs, errors } = await fetchAllJobs(apiKey);

  console.log(`Fetched ${jobs.length} qualifying job(s).\n`);
  for (const job of jobs) {
    console.log(
      `[score ${job.score}] ${job.title} @ ${job.company} — ${job.location}` +
        `${job.isRemote ? " (remote)" : ""}${job.isGta ? " (GTA)" : ""}` +
        `${job.meetsSalaryTarget ? " ($160k+)" : ""}\n  ${job.applyLink}`
    );
  }

  if (errors.length) {
    console.log("\nErrors during fetch:");
    errors.forEach((e) => console.log(" -", e));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
