import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const slips = await prisma.predictionSlip.findMany({
    where: { userId: user.id },
    include: {
      legs: {
        include: {
          match: {
            select: { homeTeam: true, awayTeam: true, status: true, kickoff: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ slips });
}