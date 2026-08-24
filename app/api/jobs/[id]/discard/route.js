const { discardJob, undiscardJob } = require("../../../../../lib/store");

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { id } = await params;
  await discardJob(id);
  return Response.json({ ok: true });
}

// Undo an accidental discard.
export async function DELETE(request, { params }) {
  const { id } = await params;
  await undiscardJob(id);
  return Response.json({ ok: true });
}
