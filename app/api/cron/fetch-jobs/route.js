const { fetchAllJobs } = require("../../../../lib/jsearch");
const { fetchLinkedInEmailJobs } = require("../../../../lib/linkedinEmail");
const { sendSelfAlert } = require("../../../../lib/gmailAlert");
const { saveFetchResult } = require("../../../../lib/store");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request) {
  // Vercel Cron sends this header automatically when CRON_SECRET is set.
  // Also allow manual triggers with the same bearer token for local testing.
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet; allow (dev convenience)
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function mergeJobs(jsearchJobs, emailJobs) {
  const seen = new Set(jsearchJobs.map((j) => `${j.company}|${j.title}`.toLowerCase()));
  const uniqueEmailJobs = emailJobs.filter((j) => !seen.has(`${j.company}|${j.title}`.toLowerCase()));
  return [...jsearchJobs, ...uniqueEmailJobs];
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const errors = [];
  let jsearchJobs = [];
  let rawCounts = {};
  let emailResult = { jobs: [], rawCount: 0, emailCount: 0 };

  try {
    const result = await fetchAllJobs(process.env.RAPIDAPI_KEY);
    jsearchJobs = result.jobs;
    rawCounts = result.rawCounts;
    errors.push(...result.errors);
  } catch (err) {
    errors.push(`JSearch: ${String(err.message || err)}`);
  }

  try {
    emailResult = await fetchLinkedInEmailJobs();
  } catch (err) {
    const message = String(err.message || err);
    errors.push(`LinkedIn email check: ${message}`);
    try {
      await sendSelfAlert(
        "J-Search: LinkedIn email check failed",
        `The 3 AM job fetch could not read your LinkedIn job-alert emails.\n\nError: ${message}\n\n` +
          "The rest of the job search (JSearch) still ran normally. Check the Vercel logs for " +
          "/api/cron/fetch-jobs, or re-run the Gmail setup at /api/auth/gmail/start if the " +
          "refresh token expired or was revoked."
      );
    } catch (alertErr) {
      errors.push(`Failure alert email also failed: ${String(alertErr.message || alertErr)}`);
    }
  }

  const jobs = mergeJobs(jsearchJobs, emailResult.jobs);
  await saveFetchResult(jobs, errors);

  return Response.json({
    ok: true,
    count: jobs.length,
    jsearchCount: jsearchJobs.length,
    linkedinEmailCount: emailResult.jobs.length,
    linkedinEmailsScanned: emailResult.emailCount,
    rawCounts,
    errors,
    generatedAt: new Date().toISOString(),
  });
}
