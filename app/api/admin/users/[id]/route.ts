import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { addLedgerEntry } from "@/lib/ledger";

// Reads/writes live data — must never be statically pre-rendered.
export const dynamic = "force-dynamic";

/**
 * Edit a user's details, ban/unban (suspended), change role, or issue a
 * manual balance adjustment (credit or debit) with a note.
 *
 * Body (all fields optional, send only what changed):
 *   { username, email, role, suspended, walletAddress,
 *     adjustAmount, adjustReason }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const {
    username,
    email,
    role,
    suspended,
    walletAddress,
    adjustAmount,
    adjustReason,
  } = body;

  const data: Record<string, unknown> = {};
  if (typeof username === "string" && username.trim()) data.username = username.trim();
  if (typeof email === "string" && email.trim()) data.email = email.trim().toLowerCase();
  if (role === "USER" || role === "ADMIN") {
    // Prevent an admin from locking themselves out by demoting the
    // only remaining admin account.
    if (target.role === "ADMIN" && role === "USER") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "CANNOT_DEMOTE_LAST_ADMIN" }, { status: 400 });
      }
    }
    data.role = role;
  }
  if (typeof suspended === "boolean") data.suspended = suspended;
  if (typeof walletAddress === "string") data.walletAddress = walletAddress.trim() || null;

  let updated = target;
  if (Object.keys(data).length > 0) {
    try {
      updated = await prisma.user.update({ where: { id: params.id }, data });
    } catch (e: any) {
      if (e.code === "P2002") {
        const field = e.meta?.target?.[0] ?? "field";
        return NextResponse.json({ error: `DUPLICATE_${String(field).toUpperCase()}` }, { status: 409 });
      }
      throw e;
    }
  }

  if (typeof adjustAmount === "number" && adjustAmount !== 0) {
    await addLedgerEntry({
      userId: params.id,
      type: "ADMIN_ADJUSTMENT",
      amount: Math.trunc(adjustAmount),
      description: adjustReason || "Manual admin adjustment",
      referencePrefix: "adj",
    });
  }

  return NextResponse.json({ ok: true, user: updated });
}

/**
 * Permanently remove a user and every record that references them
 * (ledger entries, deposits, withdrawals, predictions/slips, stakes),
 * in one transaction so nothing is left orphaned.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (admin.id === params.id) {
    return NextResponse.json({ error: "CANNOT_DELETE_SELF" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.$transaction([
    prisma.prediction.deleteMany({ where: { userId: params.id } }),
    prisma.predictionSlip.deleteMany({ where: { userId: params.id } }),
    prisma.stake.deleteMany({ where: { userId: params.id } }),
    prisma.depositRequest.deleteMany({ where: { userId: params.id } }),
    prisma.withdrawalRequest.deleteMany({ where: { userId: params.id } }),
    prisma.ledgerEntry.deleteMany({ where: { userId: params.id } }),
    // Referrals: detach anyone this user referred rather than deleting them.
    prisma.user.updateMany({ where: { referredByUserId: params.id }, data: { referredByUserId: null } }),
    prisma.user.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}