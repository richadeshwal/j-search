const { fetchAllJobs } = require("../../../../lib/jsearch");
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

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { jobs, errors, rawCounts } = await fetchAllJobs(process.env.RAPIDAPI_KEY);
    await saveFetchResult(jobs, errors);
    return Response.json({
      ok: true,
      count: jobs.length,
      rawCounts,
      errors,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
