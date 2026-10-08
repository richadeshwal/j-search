# J-Search

Tracks new **AI Product Manager**, **AI Project Manager**, **ML Product Manager**,
and **PM for AI** openings from three sources: the
[JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) API (which
aggregates LinkedIn, Indeed, Glassdoor, ZipRecruiter, and more via Google for
Jobs), your own Gmail — parsing LinkedIn's job-alert emails from the last
48 hours directly — and Manulife's own careers page.

- Refreshes automatically every day at **3:00 AM ET** via Vercel Cron.
- Only keeps jobs posted in the **last 7 days**.
- Only keeps jobs that are **remote**, or **located in the Greater Toronto Area**
  (JSearch has no reliable "hybrid" flag, so any GTA-located result is kept —
  the "Likely hybrid" badge is a best-effort guess from the listing text).
- Ranks results, giving priority to **remote** jobs and jobs paying **$150k+**.
- Three working tabs: **New Jobs**, **Toronto / GTA**, **Applied** (plus
  **Shortlisted** and **Discarded** as additional views).
- **Discard** hides a job permanently — it's stored server-side (Vercel KV),
  so it never comes back even after the next day's refresh, on any device.
- **Mark applied** moves a job to the Applied tab and snapshots it, so it
  stays in your applied history even after it ages out of the 7-day window.
- **Shortlist** (☆ button) flags a job you're planning to apply to without
  removing it from New/GTA — it also shows up in the Shortlisted tab. Resume
  tailoring for shortlisted jobs happens in a Claude chat (paste your resume
  + the job details there) rather than inside this app.
- Every tab groups jobs under an **industry heading** (Financial Services,
  Healthcare & Life Sciences, Technology / Software, etc.) — inferred from
  the employer name/description, since JSearch has no industry field
  (`classifyIndustry` in `lib/jsearch.js`); best-effort, not a verified
  classification.
- Also scans **Manulife's own careers page** (Workday-hosted) for any
  Product/Project/Program Manager opening — unlike every other source in
  this app, Manulife results **skip the AI-relevance gate** by design
  (per-employer exception; still require remote-or-GTA + a PM title).
- Also scans your Gmail for **LinkedIn job-alert emails from the last 48
  hours** and folds any matching jobs into the same list. If that step
  fails (expired token, Gmail API error, etc.), you get an email to your
  own inbox saying so — the rest of the fetch still runs normally.

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
   entries so the job fires at 3:00 AM Eastern year-round, accounting for the
   DST switch between EST/EDT — Vercel Cron itself only understands UTC).

6. **Trigger the first fetch manually** rather than waiting for 3 AM: visit
   `https://<your-deployment>/api/cron/fetch-jobs` with the `Authorization:
   Bearer <CRON_SECRET>` header (e.g. `curl -H "Authorization: Bearer
   <secret>" https://.../api/cron/fetch-jobs`), or temporarily unset
   `CRON_SECRET` and hit the URL directly in a browser.

Note: Vercel's Hobby (free) plan may execute cron jobs within roughly an
hour of the scheduled time rather than to-the-minute. If you need exact
timing, a Pro plan removes that slack.

## Gmail setup (for the LinkedIn email check)

This is a separate setup from JSearch/RapidAPI — it lets the app read
LinkedIn job-alert emails from your inbox and email you if that step fails.
It's optional; without it, the app still runs on JSearch alone.

1. **Create a Google Cloud project**: go to
   [console.cloud.google.com](https://console.cloud.google.com), create a
   new project (or reuse one).

2. **Enable the Gmail API**: in that project, go to APIs & Services →
   Library → search "Gmail API" → Enable.

3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent
   screen → User Type **External** → fill in an app name and your email →
   under "Test users" add your own Gmail address (this keeps the app in
   testing mode, which is fine since only you will ever use it).

4. **Create an OAuth Client ID**: APIs & Services → Credentials → Create
   Credentials → OAuth client ID → Application type **Web application** →
   under "Authorized redirect URIs" add:
   `https://<your-deployment>/api/auth/gmail/callback`
   Save, then copy the **Client ID** and **Client Secret** it shows you.

5. **Add env vars in Vercel**: `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`
   from step 4. Deploy (or redeploy) so they take effect.

6. **Get a refresh token**: visit `https://<your-deployment>/api/auth/gmail/start`
   in your browser, sign in with the Gmail account whose LinkedIn emails you
   want read, and approve access. You'll land on a plain text page showing a
   refresh token — copy it.

7. **Add the refresh token**: set `GMAIL_REFRESH_TOKEN` in Vercel to the
   value from step 6, then redeploy one more time.

8. **Verify**: manually trigger `/api/cron/fetch-jobs` again (per step 6 of
   the main setup) — the response now includes `linkedinEmailCount` and
   `linkedinEmailsScanned` fields.

If you ever see "No refresh_token in the response" at the callback URL, it
means this Google account already granted access before (Google only issues
a refresh token on the *first* consent). Go to
[myaccount.google.com/permissions](https://myaccount.google.com/permissions),
remove the app's access, and repeat step 6.

## Local development

```bash
npm install
cp .env.example .env   # fill in RAPIDAPI_KEY; KV vars needed only for the full app
npm run test-fetch     # sanity-check the JSearch integration without touching KV
npm run dev            # runs the app at localhost:3000 (KV env vars required for the UI)
```

## How the filtering works (`lib/jsearch.js`)

- Searches JSearch once per job title (4 requests total/day), each query
  anchored to `"<title> jobs in Toronto, Ontario, Canada"`, with
  `date_posted=week`. (An earlier version also ran an unanchored `"<title>
  jobs"` pass to catch remote postings, but a real run showed it qualifying
  only 2/40 results — not worth doubling the JSearch request budget for.)
- A result **qualifies** if `job_is_remote` is true, or its location matches
  a Greater Toronto Area city list (Toronto, Mississauga, Brampton, Markham,
  Vaughan, Etobicoke, Scarborough, North York, etc.) — in practice, since
  every query is now Toronto-anchored, results skew almost entirely GTA;
  remote-but-not-Toronto jobs only show up if one incidentally surfaces from
  that search.
- **Title relevance gate**: the job title itself must contain "Product
  Manager", "Project Manager", "Program Manager", "Product Owner", "TPM",
  or "PM" (`isRelevantTitle` in `lib/jsearch.js`, shared with the LinkedIn
  email parser). Both JSearch's semantic search and the user's own LinkedIn
  alert searches otherwise surface adjacent-but-different roles — "Senior
  Manager, AI Enablement," "Data Science Manager," "Value Stream Owner,
  Technology" — that have nothing to do with product/project management.
  Senior IC/Director titles that say "Product Management" without "Manager"
  (e.g. "Director, AI Strategy and Product Management") are currently
  excluded too — tune the regex if you want those included.
- **AI/ML relevance gate**: on top of the title gate, the job must also be
  genuinely AI/ML-related — title or description (JSearch jobs only; email
  jobs have no description) must contain "AI", "ML", "machine learning",
  "LLM"/"large language model", "generative AI"/"genAI", "agentic", "NLP",
  "deep learning", or "neural network" (`isAiRelated`). A generic PM title
  with no AI signal in the title (and no description to check, as with
  email-sourced jobs) is excluded even if the company is AI-focused — e.g.
  a product literally branded "Falcon Writer" with no "AI"/"ML" keyword in
  its title would be missed.
- **Entry-level exclusion**: a posting whose title or description says
  "entry level," "junior," "new grad(uate)," or "internship" is excluded
  outright (`isEntryLevel` in `lib/jsearch.js`, shared with the LinkedIn
  email parser and the Manulife careers scan, both title-only since neither
  has a description to check).
- **Freshness safety net**: JSearch's `date_posted=week` parameter isn't
  reliably honored by every underlying publisher — a stale listing (e.g.
  from "Ai-Search.io") has been seen slipping through months after its
  real posting date. `normalizeJob` now independently re-checks
  `job_posted_at_datetime_utc` against a 7-day cutoff itself and drops
  anything older, rather than trusting the request parameter alone. A job
  with no timestamp at all still passes (can't confirm either way).
- **Salary floor**: a job with a *confirmed* salary under $160,000/yr is
  excluded outright (`SALARY_FLOOR` in `lib/jsearch.js`) — not just
  deprioritized. A job with no listed salary still passes (most postings
  don't list one; excluding all of those too would gut the list almost
  entirely).
- **Score** (used to sort the New Jobs tab): +2 remote, +2 salary ≥ $150,000/yr
  (hourly/monthly/weekly pay is annualized for comparison), +1 GTA job whose
  description mentions "hybrid".
- Salary currency is whatever JSearch reports for that listing (usually USD
  for US-based postings, CAD for Canadian ones) — both the $150k sort
  threshold and the $160k floor are flat numbers, not currency-converted.

## How the LinkedIn email parsing works (`lib/linkedinEmail.js`)

- Searches Gmail for `from:(jobalerts-noreply@linkedin.com OR
  jobs-noreply@linkedin.com) newer_than:2d` (LinkedIn's own job-alert and
  job-recommendation senders, last 48 hours).
- LinkedIn's digest emails list jobs as repeating text blocks ending in a
  "View job: `<url>`" line; the parser walks backward from each of those to
  pull out title/company/location, skipping known metadata lines ("N
  connections", "This company is actively hiring", etc).
- Same remote-or-GTA qualifying filter as JSearch results, merged into the
  same list (deduped against JSearch by company+title).

## How the Manulife careers scan works (`lib/manulifeCareers.js`)

- Calls Manulife's Workday-hosted career site's job-search JSON endpoint
  directly (`manulife.wd3.myworkdayjobs.com`) with `searchText: "Product
  Manager"` — this is an undocumented-but-widely-used API pattern common to
  Workday-hosted career sites, not an official public API. If Manulife
  changes career platforms or Workday changes this endpoint's shape, this
  silently stops returning results (check `manulifeCount` in a manual
  `/api/cron/fetch-jobs` response).
- Workday's list view only returns a relative posted-date string ("Posted
  3 Days Ago", "Posted 30+ Days Ago") and no job description — so the
  7-day window is parsed from that string (anything unparseable or "30+"
  is treated as too old, not guessed at), and there's no description to
  check for AI-relevance, employment type, or hybrid detection.
- **Intentionally skips the AI-relevance gate** — every PM/Project/Program
  Manager-titled opening at Manulife that's remote-or-GTA passes, AI-themed
  or not. This is a deliberate per-employer exception; every other source
  in this app still requires AI/ML relevance.

## Known limitations

- JSearch's free "Basic" plan on RapidAPI is hard-capped at **200
  requests/month**. This app runs 4 requests/day (one per job title), once
  daily at 3 AM ET, ≈ 120/month — safely under the cap with room for
  manual test triggers.
- "Hybrid" detection is a heuristic (keyword match in the job description),
  since the API doesn't expose a clean remote/hybrid/onsite field.
- The Discarded tab only shows jobs still present in the current 7-day fetch
  window — a discarded job that ages out of that window disappears from the
  tab, but its ID stays permanently blocked from ever reappearing.
- LinkedIn's plain-text emails don't reliably expose employment type
  (contract vs. permanent), so contract exclusion for email-sourced jobs
  only catches "Contract"/"Temp" appearing literally in the job title —
  weaker than the JSearch-sourced filter, which reads the API's actual
  employment-type field.
- LinkedIn's email format isn't a public API — if they change their
  template, the parser can silently start missing jobs. Watch the
  `linkedinEmailCount` field in a manual `/api/cron/fetch-jobs` response if
  results seem to drop off.
- The Shortlisted tab, like Discarded, only shows jobs still present in the
  current 7-day fetch window.
