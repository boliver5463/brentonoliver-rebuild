// Contact form handler: verifies a Cloudflare Turnstile token, then emails the
// submission to the configured recipient via Amazon SES (SESv2).
//
// Designed for a Lambda Function URL (Node.js 20.x runtime). The AWS SDK v3 is
// provided by the runtime, and `fetch` is a global in Node 18+, so this file
// has no bundled dependencies.
//
// Required environment variables:
//   TURNSTILE_SECRET  - Cloudflare Turnstile SECRET key
//   SES_FROM          - a verified SES sender identity, e.g. "no-reply@yourdomain.com"
// Optional environment variables:
//   TO_EMAIL          - recipient (default: boliver5463@gmail.com)
//   ALLOWED_ORIGIN    - CORS origin to allow (default: "*")

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({});

const TO_EMAIL = process.env.TO_EMAIL || "boliver5463@gmail.com";
const FROM_EMAIL = process.env.SES_FROM;
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const MAX = { name: 100, email: 150, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

async function verifyTurnstile(token, ip) {
  const form = new URLSearchParams();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form }
  );
  return res.json();
}

export const handler = async (event) => {
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || "POST";

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  if (!FROM_EMAIL) {
    console.error("Missing SES_FROM environment variable.");
    return json(500, { error: "Server is not configured correctly." });
  }

  // Parse body
  let data;
  try {
    let raw = event.body || "{}";
    if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
    data = JSON.parse(raw);
  } catch {
    return json(400, { error: "Invalid request body." });
  }

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const message = String(data.message || "").trim();
  const token = String(data.token || "");

  // Validate
  if (!name || !email || !message) {
    return json(400, { error: "Name, email and message are required." });
  }
  if (name.length > MAX.name || email.length > MAX.email || message.length > MAX.message) {
    return json(400, { error: "One or more fields are too long." });
  }
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: "Please provide a valid email address." });
  }

  // Optional CAPTCHA: only enforced once TURNSTILE_SECRET is set. Until then the
  // form works without a challenge; to enable, set the env var and re-add the
  // widget in _includes/contact.html (send its token as `token`).
  if (TURNSTILE_SECRET) {
    if (!token) {
      return json(400, { error: "Missing verification token." });
    }
    const ip =
      event?.headers?.["cf-connecting-ip"] ||
      event?.headers?.["x-forwarded-for"]?.split(",")[0].trim() ||
      event?.requestContext?.http?.sourceIp;

    let verify;
    try {
      verify = await verifyTurnstile(token, ip);
    } catch (err) {
      console.error("Turnstile request failed:", err);
      return json(502, { error: "Could not verify the challenge. Please try again." });
    }
    if (!verify.success) {
      console.warn("Turnstile rejected:", verify["error-codes"]);
      return json(403, { error: "Verification failed. Please try again." });
    }
  }

  // Send email
  const subject = `New contact form message from ${name}`;
  const text = `Name: ${name}\nEmail: ${email}\n\n${message}`;
  const html =
    `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` +
    `<p style="white-space:pre-wrap;margin-top:1rem">${escapeHtml(message)}</p>`;

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL,
        Destination: { ToAddresses: [TO_EMAIL] },
        ReplyToAddresses: [email],
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: text, Charset: "UTF-8" },
              Html: { Data: html, Charset: "UTF-8" },
            },
          },
        },
      })
    );
  } catch (err) {
    console.error("SES send failed:", err);
    return json(502, { error: "Failed to send your message. Please try again later." });
  }

  return json(200, { ok: true });
};
