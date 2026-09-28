import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCutover } from "@/lib/cutover";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same logic as scripts/cutover.ts (see lib/cutover.ts). The GitHub
// Actions workflow is the recommended way to run it — no request
// timeout — but this button still works and is safe to re-run.
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  try {
    const result = await runCutover();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("cutover failed:", e);
    return NextResponse.json({ error: e.message ?? "CUTOVER_FAILED" }, { status: 500 });
  }
}