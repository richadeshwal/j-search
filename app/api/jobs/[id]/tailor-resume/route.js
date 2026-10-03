const { findJobById, getResume } = require("../../../../../lib/store");
const { tailorResume } = require("../../../../../lib/resumeTailor");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request, { params }) {
  const { id } = await params;

  const [job, resumeText] = await Promise.all([findJobById(id), getResume()]);

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }
  if (!resumeText) {
    return Response.json({ error: "No resume saved yet — add one on the Resume page first" }, { status: 400 });
  }

  try {
    const tailored = await tailorResume(resumeText, job);
    return Response.json({ ok: true, tailored, job: { id: job.id, title: job.title, company: job.company } });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
