const { getAccessToken } = require("./gmailAuth");

function buildRawMessage({ to, subject, body }) {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

async function getOwnEmailAddress(accessToken) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to look up Gmail profile: ${res.status}`);
  const json = await res.json();
  return json.emailAddress;
}

// Sends a plain-text email to the account's own inbox. Used to surface
// failures from automated steps that have no other way to reach the user.
async function sendSelfAlert(subject, body) {
  const accessToken = await getAccessToken();
  const to = process.env.ALERT_EMAIL_TO || (await getOwnEmailAddress(accessToken));

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: buildRawMessage({ to, subject, body }) }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Failed to send alert email: ${res.status} ${errBody}`);
  }
}

module.exports = { sendSelfAlert };
