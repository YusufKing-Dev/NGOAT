"use client";
import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: "USER" | "ADMIN";
  suspended: boolean;
  emailVerified: boolean;
  createdAt: string;
  balance: number;
  predictionCount: number;
  stakeCount: number;
  walletAddress: string | null;
};

type Deposit = {
  id: string;
  usdtAmount: number;
  network: string;
  txHash: string;
  creditsToIssue: number;
  status: string;
  autoVerified: boolean;
  createdAt: string;
  user: { username: string; email: string };
};

type Withdrawal = {
  id: string;
  usdtAmount: number;
  network: string;
  walletAddress: string;
  status: string;
  createdAt: string;
  user: { username: string; email: string };
};

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  entryCredits: number;
  rewardCredits: number;
  kickoff: string;
};

type Stake = {
  id: string;
  principal: number;
  duration: string;
  dailyRatePct: number;
  status: string;
  startedAt: string;
  maturesAt: string;
  releaseAmount: number | null;
  user: { username: string; email: string };
};

type PredictionSlip = {
  id: string;
  stake: number;
  status: string;
  reward: number | null;
  createdAt: string;
  user: { username: string; email: string };
  legs: {
    id: string;
    pick: string;
    status: string;
    match: { homeTeam: string; awayTeam: string; status: string };
  }[];
};

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  reference: string;
  createdAt: string;
  user: { username: string; email: string };
};

type PlatformConfig = {
  id: string;
  usdtToCreditsRate: number;
  depositWallet: string | null;
  depositNetwork: string | null;
  minDeposit: number;
  maxDeposit: number;
  minRedemption: number;
  maxRedemption: number;
  signupBonusCredits: number;
  bonusWageringMultiplier: number;
  minBetCredits: number;
  rewardMultiplier: number;
  referralBonusCredits: number;
  minSlipLegs: number;
  stakingMinCredits: number;
  stakingDailyRatePct: number;
  minWithdrawalUsdt: number;
  maxDailyWithdrawalUsdt: number;
  solanaUsdtMint: string | null;
  solanaRpcEndpoint: string | null;
};

const TABS = ["Users", "Deposits", "Withdrawals", "Predictions", "Stakes", "Activity", "Matches", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("Users");
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stakes, setStakes] = useState<Stake[]>([]);
  const [slips, setSlips] = useState<PredictionSlip[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [configSaving, setConfigSaving] = useState(false);

  const [newMatch, setNewMatch] = useState({
    homeTeam: "",
    awayTeam: "",
    kickoff: "",
    predictionDeadline: "",
  });

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
    role: "USER" as "USER" | "ADMIN",
    walletAddress: "",
    adjustAmount: "",
    adjustReason: "",
  });

  const [editingDepositId, setEditingDepositId] = useState<string | null>(null);
  const [depositForm, setDepositForm] = useState({ usdtAmount: "", creditsToIssue: "", network: "", txHash: "" });

  const [editingWithdrawalId, setEditingWithdrawalId] = useState<string | null>(null);
  const [withdrawalForm, setWithdrawalForm] = useState({ usdtAmount: "", network: "", walletAddress: "" });

  // Fetches and parses JSON defensively: a non-OK or empty response
  // (a server error, an auth redirect, a route that isn't compiled
  // yet) would otherwise throw "Unexpected end of JSON input" and,
  // being unhandled, crash the whole admin page. Log the real cause
  // to the console instead so it's diagnosable, and let other
  // sections keep loading.
  async function safeJson<T>(url: string): Promise<T | null> {
    try {
      const r = await fetch(url);
      const text = await r.text();
      if (!r.ok) {
        console.error(`${url} -> ${r.status}`, text);
        return null;
      }
      if (!text) return null;
      return JSON.parse(text) as T;
    } catch (e) {
      console.error(`${url} failed`, e);
      return null;
    }
  }

  function loadAll() {
    safeJson<{ users: AdminUser[] }>("/api/admin/users").then((d) => {
      if (d) setUsers(d.users ?? []);
      else setError("Admin access only.");
    });
    safeJson<{ deposits: Deposit[] }>("/api/admin/deposits").then((d) => d && setDeposits(d.deposits ?? []));
    safeJson<{ withdrawals: Withdrawal[] }>("/api/admin/withdrawals").then(
      (d) => d && setWithdrawals(d.withdrawals ?? [])
    );
    safeJson<{ matches: Match[] }>("/api/admin/matches").then((d) => d && setMatches(d.matches ?? []));
    safeJson<{ stakes: Stake[] }>("/api/admin/stakes").then((d) => d && setStakes(d.stakes ?? []));
    safeJson<{ slips: PredictionSlip[] }>("/api/admin/predictions").then((d) => d && setSlips(d.slips ?? []));
    safeJson<{ entries: LedgerEntry[] }>("/api/admin/ledger").then((d) => d && setLedger(d.entries ?? []));
    safeJson<{ config: PlatformConfig }>("/api/admin/config").then((d) => {
      if (!d?.config) return;
      setConfig(d.config);
      const strForm: Record<string, string> = {};
      Object.entries(d.config).forEach(([k, v]) => {
        if (k !== "id") strForm[k] = v == null ? "" : String(v);
      });
      setConfigForm(strForm);
    });
  }

  useEffect(loadAll, []);


  // ---- Users ----
  function startEditUser(u: AdminUser) {
    setEditingUserId(u.id);
    setEditForm({
      username: u.username,
      email: u.email,
      role: u.role,
      walletAddress: u.walletAddress ?? "",
      adjustAmount: "",
      adjustReason: "",
    });
  }

  async function saveUser(id: string) {
    const payload: Record<string, unknown> = {
      username: editForm.username,
      email: editForm.email,
      role: editForm.role,
      walletAddress: editForm.walletAddress,
    };
    if (editForm.adjustAmount.trim()) {
      payload.adjustAmount = Number(editForm.adjustAmount);
      payload.adjustReason = editForm.adjustReason || undefined;
    }
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Failed to update user.");
      return;
    }
    setEditingUserId(null);
    loadAll();
  }

  async function toggleSuspend(u: AdminUser) {
    const verb = u.suspended ? "unban" : "ban";
    if (!confirm(`Are you sure you want to ${verb} ${u.username}?`)) return;
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !u.suspended }),
    });
    loadAll();
  }

  async function removeUser(u: AdminUser) {
    if (!confirm(`Permanently delete ${u.username} and all their records? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Failed to delete user.");
      return;
    }
    loadAll();
  }

  // ---- Deposits ----
  function startEditDeposit(d: Deposit) {
    setEditingDepositId(d.id);
    setDepositForm({
      usdtAmount: String(d.usdtAmount),
      creditsToIssue: String(d.creditsToIssue),
      network: d.network,
      txHash: d.txHash,
    });
  }
  async function saveDeposit(id: string) {
    await fetch(`/api/admin/deposits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usdtAmount: Number(depositForm.usdtAmount),
        creditsToIssue: Number(depositForm.creditsToIssue),
        network: depositForm.network,
        txHash: depositForm.txHash,
      }),
    });
    setEditingDepositId(null);
    loadAll();
  }
  async function approveDeposit(id: string) {
    await fetch(`/api/admin/deposits/${id}/approve`, { method: "POST" });
    loadAll();
  }
  async function rejectDeposit(id: string) {
    await fetch(`/api/admin/deposits/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejected by admin" }),
    });
    loadAll();
  }

  // ---- Withdrawals ----
  function startEditWithdrawal(w: Withdrawal) {
    setEditingWithdrawalId(w.id);
    setWithdrawalForm({ usdtAmount: String(w.usdtAmount), network: w.network, walletAddress: w.walletAddress });
  }
  async function saveWithdrawal(id: string) {
    await fetch(`/api/admin/withdrawals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usdtAmount: Number(withdrawalForm.usdtAmount),
        network: withdrawalForm.network,
        walletAddress: withdrawalForm.walletAddress,
      }),
    });
    setEditingWithdrawalId(null);
    loadAll();
  }
  async function payWithdrawal(id: string) {
    const payoutTxHash = prompt("Payout transaction hash:");
    if (!payoutTxHash) return;
    await fetch(`/api/admin/withdrawals/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutTxHash }),
    });
    loadAll();
  }

  // ---- Matches ----
  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMatch),
    });
    setNewMatch({ homeTeam: "", awayTeam: "", kickoff: "", predictionDeadline: "" });
    loadAll();
  }
  async function settleMatch(id: string) {
    const home = prompt("Final home score:");
    const away = prompt("Final away score:");
    if (home === null || away === null) return;
    await fetch(`/api/admin/matches/${id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalHomeScore: Number(home), finalAwayScore: Number(away) }),
    });
    loadAll();
  }

  // ---- Settings ----
  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    const res = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configForm),
    });
    setConfigSaving(false);
    if (!res.ok) {
      alert("Failed to save settings.");
      return;
    }
    loadAll();
  }

  if (error) return <p className="text-loss pt-10 text-center">{error}</p>;

  const pendingDeposits = deposits.filter((d) => d.status === "PENDING").length;
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "PENDING").length;

  return (
    <div className="pt-6 space-y-6">
      <h1 className="scoreboard text-3xl">ADMIN</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const badge =
            t === "Deposits" && pendingDeposits > 0
              ? pendingDeposits
              : t === "Withdrawals" && pendingWithdrawals > 0
              ? pendingWithdrawals
              : null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap text-xs font-semibold tracking-wide px-4 py-2 rounded-lg transition ${
                tab === t ? "btn-primary" : "btn-secondary"
              }`}
            >
              {t}
              {badge !== null && <span className="ml-1 text-loss">({badge})</span>}
            </button>
          );
        })}
      </div>

      {tab === "Users" && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">
            Accounts <span className="normal-case text-xs">({users.length})</span>
          </h2>
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="border-b border-white/5 pb-3 text-sm">
                {editingUserId === u.id ? (
                  <div className="space-y-2">
                    <input
                      className="input"
                      placeholder="Username"
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Wallet address"
                      value={editForm.walletAddress}
                      onChange={(e) => setEditForm({ ...editForm, walletAddress: e.target.value })}
                    />
                    <select
                      className="input"
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value as "USER" | "ADMIN" })}
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <div className="flex gap-2">
                      <input
                        className="input"
                        placeholder="Balance adjustment (+/-)"
                        value={editForm.adjustAmount}
                        onChange={(e) => setEditForm({ ...editForm, adjustAmount: e.target.value })}
                      />
                      <input
                        className="input"
                        placeholder="Reason"
                        value={editForm.adjustReason}
                        onChange={(e) => setEditForm({ ...editForm, adjustReason: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveUser(u.id)} className="btn-primary text-xs py-1 px-3">
                        Save
                      </button>
                      <button onClick={() => setEditingUserId(null)} className="btn-secondary text-xs py-1 px-3">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{u.username}</span>
                      <span className="text-muted text-xs">{u.email}</span>
                      {u.role === "ADMIN" && <span className="text-xs text-brand">ADMIN</span>}
                      {u.suspended && <span className="text-xs text-loss">BANNED</span>}
                      {!u.emailVerified && <span className="text-xs text-muted">unverified</span>}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      Balance: {u.balance.toLocaleString()} NGC · Predictions: {u.predictionCount} · Stakes:{" "}
                      {u.stakeCount} · Joined {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                    {u.walletAddress && <p className="text-xs text-muted break-all">Wallet: {u.walletAddress}</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => startEditUser(u)} className="btn-secondary text-xs py-1 px-3">
                        Edit
                      </button>
                      <button onClick={() => toggleSuspend(u)} className="btn-secondary text-xs py-1 px-3">
                        {u.suspended ? "Unban" : "Ban"}
                      </button>
                      <button onClick={() => removeUser(u)} className="btn-secondary text-xs py-1 px-3 text-loss">
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {users.length === 0 && <p className="text-muted text-sm">No users.</p>}
          </div>
        </section>
      )}

      {tab === "Deposits" && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Deposits</h2>
          <div className="space-y-3">
            {deposits.map((d) => (
              <div key={d.id} className="border-b border-white/5 pb-2 text-sm">
                {editingDepositId === d.id ? (
                  <div className="space-y-2">
                    <input
                      className="input"
                      placeholder="USDT amount"
                      value={depositForm.usdtAmount}
                      onChange={(e) => setDepositForm({ ...depositForm, usdtAmount: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Credits to issue"
                      value={depositForm.creditsToIssue}
                      onChange={(e) => setDepositForm({ ...depositForm, creditsToIssue: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Network"
                      value={depositForm.network}
                      onChange={(e) => setDepositForm({ ...depositForm, network: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Tx hash"
                      value={depositForm.txHash}
                      onChange={(e) => setDepositForm({ ...depositForm, txHash: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveDeposit(d.id)} className="btn-primary text-xs py-1 px-3">
                        Save
                      </button>
                      <button onClick={() => setEditingDepositId(null)} className="btn-secondary text-xs py-1 px-3">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>
                      {d.user.username} ({d.user.email}) · {d.usdtAmount} USDT ({d.network}) →{" "}
                      {d.creditsToIssue.toLocaleString()} NGC
                      {d.autoVerified && <span className="ml-2 text-xs text-win">● on-chain</span>}
                    </p>
                    <p className="text-xs text-muted break-all">{d.txHash}</p>
                    <p className="text-xs">
                      Status: <span className="text-brand">{d.status}</span> ·{" "}
                      {new Date(d.createdAt).toLocaleString()}
                    </p>
                    {d.status === "PENDING" && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => approveDeposit(d.id)} className="btn-primary text-xs py-1 px-3">
                          Approve
                        </button>
                        <button onClick={() => rejectDeposit(d.id)} className="btn-secondary text-xs py-1 px-3">
                          Reject
                        </button>
                        <button onClick={() => startEditDeposit(d)} className="btn-secondary text-xs py-1 px-3">
                          Edit
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {deposits.length === 0 && <p className="text-muted text-sm">No deposits.</p>}
          </div>
        </section>
      )}

      {tab === "Withdrawals" && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Withdrawals</h2>
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div key={w.id} className="border-b border-white/5 pb-2 text-sm">
                {editingWithdrawalId === w.id ? (
                  <div className="space-y-2">
                    <input
                      className="input"
                      placeholder="USDT amount"
                      value={withdrawalForm.usdtAmount}
                      onChange={(e) => setWithdrawalForm({ ...withdrawalForm, usdtAmount: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Network"
                      value={withdrawalForm.network}
                      onChange={(e) => setWithdrawalForm({ ...withdrawalForm, network: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Wallet address"
                      value={withdrawalForm.walletAddress}
                      onChange={(e) => setWithdrawalForm({ ...withdrawalForm, walletAddress: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveWithdrawal(w.id)} className="btn-primary text-xs py-1 px-3">
                        Save
                      </button>
                      <button
                        onClick={() => setEditingWithdrawalId(null)}
                        className="btn-secondary text-xs py-1 px-3"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>
                      {w.user.username} ({w.user.email}) · {w.usdtAmount} USDT ({w.network})
                    </p>
                    <p className="text-xs text-muted break-all">{w.walletAddress}</p>
                    <p className="text-xs">
                      Status: <span className="text-brand">{w.status}</span> ·{" "}
                      {new Date(w.createdAt).toLocaleString()}
                    </p>
                    {w.status === "PENDING" && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => payWithdrawal(w.id)} className="btn-primary text-xs py-1 px-3">
                          Mark paid
                        </button>
                        <button onClick={() => startEditWithdrawal(w)} className="btn-secondary text-xs py-1 px-3">
                          Edit
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {withdrawals.length === 0 && <p className="text-muted text-sm">No withdrawals.</p>}
          </div>
        </section>
      )}

      {tab === "Predictions" && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Predictions (slips)</h2>
          <div className="space-y-3">
            {slips.map((s) => (
              <div key={s.id} className="border-b border-white/5 pb-2 text-sm">
                <p>
                  {s.user.username} ({s.user.email}) · stake {s.stake.toLocaleString()} NGC · status{" "}
                  <span className="text-brand">{s.status}</span>
                  {s.reward != null && <> · reward {s.reward.toLocaleString()} NGC</>}
                </p>
                <p className="text-xs text-muted">{new Date(s.createdAt).toLocaleString()}</p>
                <ul className="text-xs text-muted mt-1 space-y-0.5">
                  {s.legs.map((leg) => (
                    <li key={leg.id}>
                      {leg.match.homeTeam} vs {leg.match.awayTeam} — pick {leg.pick} ({leg.status})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {slips.length === 0 && <p className="text-muted text-sm">No predictions.</p>}
          </div>
        </section>
      )}

      {tab === "Stakes" && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Staking</h2>
          <div className="space-y-3">
            {stakes.map((s) => (
              <div key={s.id} className="border-b border-white/5 pb-2 text-sm">
                <p>
                  {s.user.username} ({s.user.email}) · {s.principal.toLocaleString()} NGC · {s.duration} ·{" "}
                  {s.dailyRatePct}%/day
                </p>
                <p className="text-xs">
                  Status: <span className="text-brand">{s.status}</span> · started{" "}
                  {new Date(s.startedAt).toLocaleDateString()} · matures{" "}
                  {new Date(s.maturesAt).toLocaleDateString()}
                  {s.releaseAmount != null && <> · released {s.releaseAmount.toLocaleString()} NGC</>}
                </p>
              </div>
            ))}
            {stakes.length === 0 && <p className="text-muted text-sm">No stakes.</p>}
          </div>
        </section>
      )}

      {tab === "Activity" && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">
            Full Activity Log <span className="normal-case text-xs">(latest 500)</span>
          </h2>
          <div className="space-y-2">
            {ledger.map((l) => (
              <div key={l.id} className="border-b border-white/5 pb-2 text-sm">
                <p>
                  {l.user.username} ({l.user.email}) ·{" "}
                  <span className={l.amount >= 0 ? "text-win" : "text-loss"}>
                    {l.amount >= 0 ? "+" : ""}
                    {l.amount.toLocaleString()} NGC
                  </span>{" "}
                  · <span className="text-brand">{l.type}</span>{" "}
                  <span className="text-xs text-muted">({l.status})</span>
                </p>
                {l.description && <p className="text-xs text-muted">{l.description}</p>}
                <p className="text-xs text-muted">
                  {l.reference} · {new Date(l.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
            {ledger.length === 0 && <p className="text-muted text-sm">No activity yet.</p>}
          </div>
        </section>
      )}

      {tab === "Settings" && config && (
        <section className="card">
          <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Platform Settings</h2>
          <form onSubmit={saveConfig} className="space-y-3">
            {(Object.keys(configForm) as (keyof typeof configForm)[]).map((key) => (
              <div key={key}>
                <label className="text-xs text-muted">{key}</label>
                <input
                  className="input"
                  value={configForm[key] ?? ""}
                  onChange={(e) => setConfigForm({ ...configForm, [key]: e.target.value })}
                />
              </div>
            ))}
            <button type="submit" className="btn-primary w-full" disabled={configSaving}>
              {configSaving ? "Saving…" : "Save settings"}
            </button>
          </form>
        </section>
      )}

      {tab === "Matches" && (
        <>
          <section className="card">
            <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Create Match</h2>
            <form onSubmit={createMatch} className="space-y-2">
              <input
                className="input"
                placeholder="Home team"
                value={newMatch.homeTeam}
                onChange={(e) => setNewMatch({ ...newMatch, homeTeam: e.target.value })}
                required
              />
              <input
                className="input"
                placeholder="Away team"
                value={newMatch.awayTeam}
                onChange={(e) => setNewMatch({ ...newMatch, awayTeam: e.target.value })}
                required
              />
              <label className="text-xs text-muted">Kickoff</label>
              <input
                type="datetime-local"
                className="input"
                value={newMatch.kickoff}
                onChange={(e) => setNewMatch({ ...newMatch, kickoff: e.target.value })}
                required
              />
              <label className="text-xs text-muted">Prediction deadline</label>
              <input
                type="datetime-local"
                className="input"
                value={newMatch.predictionDeadline}
                onChange={(e) => setNewMatch({ ...newMatch, predictionDeadline: e.target.value })}
                required
              />
              <button type="submit" className="btn-primary w-full">
                Add match
              </button>
            </form>
          </section>

          <section className="card">
            <h2 className="text-sm text-muted uppercase tracking-wide mb-3">Matches</h2>
            <div className="space-y-3">
              {matches.map((m) => (
                <div key={m.id} className="border-b border-white/5 pb-2 text-sm">
                  <p>
                    {m.homeTeam} vs {m.awayTeam} · {m.status}
                  </p>
                  {m.status === "UPCOMING" && (
                    <button onClick={() => settleMatch(m.id)} className="btn-secondary text-xs py-1 px-3 mt-1">
                      Settle
                    </button>
                  )}
                </div>
              ))}
              {matches.length === 0 && <p className="text-muted text-sm">No matches.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}