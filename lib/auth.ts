import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit } from "./security";

/**
 * NextAuth's authorize() receives req.headers as a plain object (not
 * a Fetch API Headers instance), so this is a small local adapter
 * rather than reusing lib/security's getClientIp, which expects the
 * Fetch Request shape used by ordinary API routes.
 */
function ipFromAuthReq(req: { headers?: Record<string, string> } | undefined): string {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req?.headers?.["x-real-ip"] ?? "unknown";
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const ip = ipFromAuthReq(req as any);
        // 10 attempts per IP per 15 minutes — generous for a genuine
        // user who mistypes their password a few times, but shuts
        // down scripted brute-forcing.
        const withinLimit = await checkRateLimit(ip, "login", 10, 15 * 60 * 1000);
        if (!withinLimit) throw new Error("RATE_LIMITED");
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user || user.suspended) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        // Blocks login until the verification link has been clicked.
        // Thrown here so the login page can show a specific message
        // (NextAuth surfaces this via the `error` query param) instead
        // of a generic "invalid credentials".
        if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");
        return { id: user.id, name: user.username, email: user.email, role: user.role } as any;
      },
    }),
    // Separate provider used only by the /admin/login form. Same
    // credential check as above, but rejects outright — before any
    // session is ever created — if the account isn't an ADMIN, so a
    // regular user's correct password still can't get them into the
    // admin area.
    CredentialsProvider({
      id: "admin-credentials",
      name: "Admin Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const ip = ipFromAuthReq(req as any);
        const withinLimit = await checkRateLimit(ip, "admin-login", 10, 15 * 60 * 1000);
        if (!withinLimit) throw new Error("RATE_LIMITED");
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user || user.suspended) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");
        if (user.role !== "ADMIN") throw new Error("NOT_ADMIN");
        return { id: user.id, name: user.username, email: user.email, role: user.role } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};

/** Server-side helper: current logged-in user, or null. */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as "USER" | "ADMIN",
    email: session.user.email as string,
  };
}

/** Server-side helper: current user IF they're an admin, else null. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}