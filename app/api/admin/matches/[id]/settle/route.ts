import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { settleMatch } from "@/lib/settlement";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { finalHomeScore, finalAwayScore } = await req.json();
  if (typeof finalHomeScore !== "number" || typeof finalAwayScore !== "number") {
    return NextResponse.json({ error: "INVALID_SCORE" }, { status: 400 });
  }

  try {
    const result = await settleMatch(params.id, finalHomeScore, finalAwayScore, { auto: false });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status = e.message === "MATCH_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
}