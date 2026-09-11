import { prisma } from "./prisma";

/**
 * Every disposable/throwaway-email domain confirmed in the September
 * 2026 bot-farming incident, plus the most common well-known
 * disposable-email providers generally. Not exhaustive — new
 * throwaway services appear constantly — so this is deliberately
 * paired with PlatformConfig.blockedEmailDomains, an admin-editable
 * list for anything spotted after this list was written, without
 * needing a code deploy.
 */
const KNOWN_DISPOSABLE_DOMAINS = [
  // Confirmed used in the bot attack
  "fpklm.com",
  "manyima.com",
  "liondapt.com",
  "ozsaip.com",
  "pees.ink",
  "10minutes.email",
  "olipii.com",
  "gmeenramy.com",
  "ooynib.com",
  "myralea.com",
  // Common well-known disposable/throwaway providers
  "mailinator.com",
  "yopmail.com",
  "trashmail.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "10minutemail.com",
  "getnada.com",
  "dispostable.com",
  "fakeinbox.com",
  "sharklasers.com",
  "maildrop.cc",
  "mailnesia.com",
  "mintemail.com",
];

/** Extracts and lowercases the domain portion of an email address. */
function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/**
 * True if the email's domain is on the static disposable-domain list
 * or the admin-configured extra list. Does not validate email format
 * itself — pair with a basic format check at the call site.
 */
export async function isDisposableEmail(email: string): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain) return true; // no domain at all — malformed, treat as blocked

  if (KNOWN_DISPOSABLE_DOMAINS.includes(domain)) return true;

  const config = await prisma.platformConfig.findUnique({ where: { id: "singleton" } });
  const extra = (config?.blockedEmailDomains ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return extra.includes(domain);
}

/**
 * Basic sanity check on email shape — catches the malformed addresses
 * seen in the bot wave (missing TLD, typo'd domains like
 * "gmail.comp") that a bot doesn't bother getting right since it
 * never needs to actually receive mail there.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());
}

/**
 * IP-based rate limit backed by the database (works correctly across
 * Vercel's stateless serverless instances, unlike an in-memory
 * counter). Returns true if this IP is currently within its allowed
 * number of attempts for `action` inside the given time window;
 * false if the limit's been hit and the request should be rejected.
 *
 * Every call also opportunistically prunes attempt rows older than
 * the window, so the table stays small without needing a separate
 * cleanup job.
 */
export async function checkRateLimit(
  ip: string,
  action: string,
  maxAttempts: number,
  windowMs: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);
  const key = `${action}:${ip}`;

  const [recentCount] = await Promise.all([
    prisma.registrationAttempt.count({
      where: { ip: key, createdAt: { gte: windowStart } },
    }),
    // Opportunistic cleanup — cheap, and keeps the table from growing
    // forever without a dedicated cron job.
    prisma.registrationAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  if (recentCount >= maxAttempts) return false;

  await prisma.registrationAttempt.create({ data: { ip: key } });
  return true;
}

/** Best-effort real client IP from standard proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}