import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Gates every /admin/* route. The dedicated /admin/login page is the
// only exception — it has to be reachable by someone who isn't
// authenticated yet. Everything else under /admin requires a valid
// session AND role === "ADMIN"; anyone else is bounced to the admin
// login page (or, if they're logged in as a regular user, back home).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/admin/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if ((token as any).role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};