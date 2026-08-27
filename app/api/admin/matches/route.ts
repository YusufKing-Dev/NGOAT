import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const matches = await prisma.match.findMany({
    orderBy: { kickoff: "desc" },
    take: 100,
  });
  return NextResponse.json({ matches });
}
