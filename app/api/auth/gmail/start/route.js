// One-time setup route: visit this in a browser, sign in with the Google
// account whose LinkedIn job-alert emails you want read, and approve access.
// Not linked from the app UI anywhere — only needed once during setup.
export const dynamic = "force-dynamic";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export async function GET(request) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) {
    return new Response("Missing GMAIL_CLIENT_ID env var", { status: 500 });
  }

  const redirectUri = `${new URL(request.url).origin}/api/auth/gmail/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  // access_type=offline + prompt=consent guarantees a refresh_token back,
  // even if this Google account already authorized this app before.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return Response.redirect(url.toString(), 302);
}
