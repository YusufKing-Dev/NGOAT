import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { checkSlipCompletion } from "@/lib/settlement";

// Reads live data / has side effects — must never be statically
// pre-rendered at build time.
export const dynamic = "force-dynamic";

/**
 * Safety net for a real gap in the settlement flow: checkSlipCompletion
 * normally runs automatically the moment a slip's last leg resolves,
 * but it only ever gets ONE chance to run, right at that moment. If it
 * throws partway (e.g. a transient DB error while writing the reward
 * ledger entry or the slip's final status), the slip is left stranded
 * at PENDING forever — its match is already marked SETTLED, so no
 * future cron run will ever reconsider it, and there was previously no
 * retry path at all.
 *
 * This finds every slip that's still PENDING despite having zero
 * PENDING legs left (i.e. fully resolved, just never actually paid
 * out) and re-runs the same completion check on each — which is safe
 * to call repeatedly, since it's a no-op for any slip that isn't both
 * PENDING and fully resolved.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const candidates = await prisma.predictionSlip.findMany({
    where: { status: "PENDING", legs: { none: { status: "PENDING" } } },
    select: { id: true },
  });

  let fixed = 0;
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      await checkSlipCompletion(c.id);
      fixed++;
    } catch (e: any) {
      errors.push(`${c.id}: ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, checked: candidates.length, fixed, errors });
}