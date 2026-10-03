const { saveResume, getResume } = require("../../../lib/store");

export const dynamic = "force-dynamic";

export async function GET() {
  const text = await getResume();
  return Response.json({ text });
}

export async function POST(request) {
  const { text } = await request.json();
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Resume text is required" }, { status: 400 });
  }
  await saveResume(text);
  return Response.json({ ok: true });
}
