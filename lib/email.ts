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
      text: `Welcome to NGOAT!\n\nVerify your email to activate your account:\n\n${verifyUrl}\n\nIf you didn't create this account, you can ignore this email.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #008751;">Welcome to NGOAT 🐐</h2>
          <p>Verify your email to activate your account.</p>
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

// ---------------------------------------------------------------------
// Password emails. Same Resend REST approach as sendVerificationEmail.
// ---------------------------------------------------------------------

async function sendPlainEmail(to: string, subject: string, text: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn("[email] RESEND_API_KEY or RESEND_FROM_EMAIL not set — email not sent to", to);
    return { sent: false, reason: "NOT_CONFIGURED" as const };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: `NGOAT <${fromEmail}>`, to: [to], subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend send failed:", res.status, body);
    return { sent: false, reason: "SEND_FAILED" as const };
  }
  return { sent: true as const };
}

function buttonEmail(heading: string, intro: string, buttonLabel: string, url: string, footer: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #008751;">${heading}</h2>
      <p>${intro}</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background: #008751; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          ${buttonLabel}
        </a>
      </p>
      <p style="color: #888; font-size: 13px;">${footer}</p>
    </div>
  `;
}

/** "Forgot password" email. The link expires in 30 minutes. */
export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendPlainEmail(
    to,
    "Reset your NGOAT password",
    `We received a request to reset your NGOAT password.\n\nSet a new password here (the link works for 30 minutes):\n\n${resetUrl}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.`,
    buttonEmail(
      "Reset your password",
      "We received a request to reset your NGOAT password. This link works for 30 minutes.",
      "Set a new password",
      resetUrl,
      "If you didn't ask for this, you can ignore this email — your password won't change."
    )
  );
}

/** Confirms a logged-in user's change-password request. */
export async function sendPasswordChangeConfirmEmail(to: string, confirmUrl: string) {
  return sendPlainEmail(
    to,
    "Confirm your NGOAT password change",
    `You asked to change your NGOAT password.\n\nConfirm the change here (the link works for 30 minutes):\n\n${confirmUrl}\n\nYour current password keeps working until you confirm. If you didn't ask for this, ignore this email and consider changing your password.`,
    buttonEmail(
      "Confirm your password change",
      "You asked to change your NGOAT password. Your current password keeps working until you confirm. This link works for 30 minutes.",
      "Confirm password change",
      confirmUrl,
      "If you didn't ask for this, ignore this email — nothing will change."
    )
  );
}

/** Heads-up sent after a password actually changes, in case it wasn't the owner. */
export async function sendPasswordChangedNotice(to: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return sendPlainEmail(
    to,
    "Your NGOAT password was changed",
    `The password on your NGOAT account was just changed.\n\nIf this was you, no action is needed. If it wasn't, reset your password right away: ${baseUrl}/forgot-password`,
    buttonEmail(
      "Your password was changed",
      "The password on your NGOAT account was just changed. If this was you, no action is needed.",
      "This wasn't me — reset password",
      `${baseUrl}/forgot-password`,
      "You're receiving this security notice because your account password changed."
    )
  );
}