const { applyJob, unapplyJob } = require("../../../../../lib/store");

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { id } = await params;
  const job = await request.json();
  if (!job || job.id !== id) {
    return Response.json({ error: "Job payload missing or id mismatch" }, { status: 400 });
  }
  await applyJob(job);
  return Response.json({ ok: true });
}

// Undo an accidental "mark applied".
export async function DELETE(request, { params }) {
  const { id } = await params;
  await unapplyJob(id);
  return Response.json({ ok: true });
}
