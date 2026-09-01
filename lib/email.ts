/**
 * Minimal Resend wrapper, used only for the verification email right
 * now. Uses Resend's plain REST API directly (no SDK dependency) so
 * there's nothing extra to install.
 *
 * Needs two env vars to actually send anything:
 * - RESEND_API_KEY — from Resend dashboard → API Keys
 * - RESEND_FROM_EMAIL — an address on a domain you've verified in
 *   Resend (e.g. verify@ngoat.xyz) — Resend requires domain
 *   verification (SPF/DKIM DNS records), unlike single-sender-only
 *   providers.
 *
 * Until both are set, sendVerificationEmail() logs a warning and does
 * nothing rather than throwing — so registration itself never breaks
 * just because email isn't configured yet.
 */
export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn(
      "[email] RESEND_API_KEY or RESEND_FROM_EMAIL not set — verification email not sent to",
      to
    );
    return { sent: false, reason: "NOT_CONFIGURED" as const };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `NGOAT <${fromEmail}>`,
      to: [to],
      subject: "Verify your NGOAT account",
      text: `Welcome to NGOAT!\n\nVerify your email to activate your account and claim your 20,000 NGC signup bonus:\n\n${verifyUrl}\n\nIf you didn't create this account, you can ignore this email.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #008751;">Welcome to NGOAT 🐐</h2>
          <p>Verify your email to activate your account and claim your 20,000 NGC signup bonus.</p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #008751; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Verify my email
            </a>
          </p>
          <p style="color: #888; font-size: 13px;">If you didn't create this account, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend send failed:", res.status, body);
    return { sent: false, reason: "SEND_FAILED" as const };
  }

  return { sent: true as const };
}