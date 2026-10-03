const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You tailor resumes for specific job postings. Hard rules:
- Never invent, exaggerate, or imply experience, employers, titles, tools, or
  skills that are not already present in the source resume. If the job wants
  something the resume doesn't support, leave it out — do not paper over gaps.
- You may: reorder sections/bullets to foreground what's most relevant,
  rephrase existing bullets to surface keywords from the job description
  (only when the underlying fact is already true), trim or cut content
  that's irrelevant to this job, and tighten wording for length.
- Target length: about 2 pages (roughly 650-850 words of resume content,
  not counting headers).
- Keep the resume's real structure (contact info, section headers, employer
  names, dates) factually identical to the source — only prose within
  bullets and ordering/selection may change.
- Output the tailored resume as plain text, ready to paste into a document.
  No commentary, no markdown formatting, no explanation before or after.`;

async function tailorResume(resumeText, job) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const jobContext = [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
    job.description ? `Job description:\n${job.description}` : "Job description: (not available — tailor based on title/company/location only)",
  ].join("\n\n");

  const userMessage = `SOURCE RESUME (the full, untrimmed version — this is the only source of truth for what this person has actually done):\n\n${resumeText}\n\n---\n\nTARGET JOB:\n\n${jobContext}\n\n---\n\nProduce the tailored 2-page resume now.`;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API request failed: ${res.status} ${body}`);
  }

  const json = await res.json();
  const text = (json.content || []).map((block) => block.text || "").join("");
  if (!text.trim()) {
    throw new Error("Anthropic API returned an empty response");
  }
  return text.trim();
}

module.exports = { tailorResume };
