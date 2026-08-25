// One-time setup route: Google redirects here after you approve access at
// /api/auth/gmail/start. Exchanges the auth code for a refresh token and
// displays it once so you can copy it into Vercel's GMAIL_REFRESH_TOKEN env
// var. This page does not store the token anywhere itself.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response("Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET env vars", { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Google returned an error: ${error}`, { status: 400 });
  }
  if (!code) {
    return new Response("Missing ?code param — did you land here directly instead of via /api/auth/gmail/start?", { status: 400 });
  }

  const redirectUri = `${url.origin}/api/auth/gmail/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    return new Response(`Token exchange failed: ${JSON.stringify(tokenJson)}`, { status: 500 });
  }

  if (!tokenJson.refresh_token) {
    return new Response(
      "No refresh_token in the response. This usually means this Google account already " +
        "granted access before. Go to https://myaccount.google.com/permissions, remove access " +
        "for this app, then visit /api/auth/gmail/start again.",
      { status: 500 }
    );
  }

  return new Response(
    `Copy this value into Vercel's GMAIL_REFRESH_TOKEN environment variable, then redeploy:\n\n${tokenJson.refresh_token}\n\n` +
      "This page does not save it anywhere — if you navigate away without copying it, repeat this flow.",
    { headers: { "Content-Type": "text/plain" } }
  );
}
