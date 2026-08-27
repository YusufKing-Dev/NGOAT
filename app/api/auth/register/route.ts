import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueSignupBonus } from "@/lib/ledger";

export async function POST(req: NextRequest) {
  const { username, email, password } = await req.json();

  if (!username || !email || !password || password.length < 8) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  });

  // Free 20,000 NGC signup bonus, locked behind a wagering requirement
  // before it can be withdrawn (see lib/ledger.ts).
  await issueSignupBonus(user.id);

  // TODO: this is where a one-account-per-person check should live
  // (e.g. email verification + device/IP fingerprint) before this goes
  // public — otherwise the free bonus is farmable at scale.

  return NextResponse.json({ ok: true, userId: user.id });
}
