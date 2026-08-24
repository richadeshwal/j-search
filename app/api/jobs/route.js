const { getState } = require("../../../lib/store");

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return Response.json(state);
}
