# J-Search

Tracks new **AI Product Manager**, **AI Project Manager**, **ML Product Manager**,
and **PM for AI** openings from LinkedIn, Indeed, Glassdoor, and ZipRecruiter
(via the [JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) API,
which aggregates Google for Jobs).

- Refreshes automatically every day at **3:00 PM ET** via Vercel Cron.
- Only keeps jobs posted in the **last 7 days**.
- Only keeps jobs that are **remote**, or **located in the Greater Toronto Area**
  (JSearch has no reliable "hybrid" flag, so any GTA-located result is kept —
  the "Likely hybrid" badge is a best-effort guess from the listing text).
- Ranks results, giving priority to **remote** jobs and jobs paying **$160k+**.
- Three working tabs: **New Jobs**, **Toronto / GTA**, **Applied** (plus a
  **Discarded** tab as an undo safety net).
- **Discard** hides a job permanently — it's stored server-side (Vercel KV),
  so it never comes back even after the next day's refresh, on any device.
- **Mark applied** moves a job to the Applied tab and snapshots it, so it
  stays in your applied history even after it ages out of the 7-day window.

## One-time setup

1. **Get a JSearch API key**: sign up at [RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch),
   subscribe to the free tier, and copy your API key.

2. **Import this repo into Vercel**: [vercel.com/new](https://vercel.com/new) → select `richadeshwal/j-search`.

3. **Attach a Redis store**: in the Vercel project → Storage → Marketplace
   Database Providers → **Upstash** (Redis) → Create. This auto-adds
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`, depending on integration version — the app
   reads either) — no manual setup needed. (Vercel's original standalone "KV"
   product is deprecated in favor of this Marketplace integration.)

4. **Add environment variables** (Project → Settings → Environment Variables):
   - `RAPIDAPI_KEY` — your JSearch key from step 1.
   - `CRON_SECRET` — any random string (e.g. `openssl rand -hex 20`). Vercel
     automatically sends this as a bearer token when it invokes the cron job,
     and the fetch route rejects requests without it.

5. **Deploy.** The cron schedule is already defined in `vercel.json` (two
   entries so the job fires at 3:00 PM Eastern year-round, accounting for the
   DST switch between EST/EDT — Vercel Cron itself only understands UTC).

6. **Trigger the first fetch manually** rather than waiting for 3 PM: visit
   `https://<your-deployment>/api/cron/fetch-jobs` with the `Authorization:
   Bearer <CRON_SECRET>` header (e.g. `curl -H "Authorization: Bearer
   <secret>" https://.../api/cron/fetch-jobs`), or temporarily unset
   `CRON_SECRET` and hit the URL directly in a browser.

Note: Vercel's Hobby (free) plan may execute cron jobs within roughly an
hour of the scheduled time rather than to-the-minute. If you need exact
timing, a Pro plan removes that slack.

## Local development

```bash
npm install
cp .env.example .env   # fill in RAPIDAPI_KEY; KV vars needed only for the full app
npm run test-fetch     # sanity-check the JSearch integration without touching KV
npm run dev            # runs the app at localhost:3000 (KV env vars required for the UI)
```

## How the filtering works (`lib/jsearch.js`)

- Searches JSearch once per job title with `date_posted=week`.
- A result **qualifies** if `job_is_remote` is true, or its location matches
  a Greater Toronto Area city list (Toronto, Mississauga, Brampton, Markham,
  Vaughan, Etobicoke, Scarborough, North York, etc.).
- **Score** (used to sort the New Jobs tab): +2 remote, +2 salary ≥ $160,000/yr
  (hourly/monthly/weekly pay is annualized for comparison), +1 GTA job whose
  description mentions "hybrid".
- Salary currency is whatever JSearch reports for that listing (usually USD
  for US-based postings, CAD for Canadian ones) — the $160k threshold is a
  flat number, not currency-converted.

## Known limitations

- JSearch's free tier has a monthly request quota; this app uses 8 requests/day
  (a general pass + a Toronto-anchored pass per job title) ≈ 240/month —
  check your plan's monthly limit, and if you add more titles or `num_pages`,
  watch your quota.
- "Hybrid" detection is a heuristic (keyword match in the job description),
  since the API doesn't expose a clean remote/hybrid/onsite field.
- The Discarded tab only shows jobs still present in the current 7-day fetch
  window — a discarded job that ages out of that window disappears from the
  tab, but its ID stays permanently blocked from ever reappearing.
