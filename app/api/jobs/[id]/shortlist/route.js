const { shortlistJob, unshortlistJob } = require("../../../../../lib/store");

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const { id } = await params;
  await shortlistJob(id);
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  await unshortlistJob(id);
  return Response.json({ ok: true });
}
