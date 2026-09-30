"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const ERRORS: Record<string, string> = {
  INVALID_OR_EXPIRED: "This reset link is invalid or has expired. Please request a new one.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Password can be at most 72 characters.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
};

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      router.push("/login?reset=success");
      return;
    }
    if (data.error === "INVALID_OR_EXPIRED") setExpired(true);
    setError(ERRORS[data.error] ?? "Something went wrong. Please try again.");
  }

  if (!token) {
    return (
      <div className="pt-8">
        <h1 className="scoreboard text-3xl mb-4">RESET PASSWORD</h1>
        <p className="text-sm text-loss">This reset link is missing its token. Please use the link from your email.</p>
        <p className="text-xs mt-4">
          <Link href="/forgot-password" className="text-brand underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-2">RESET PASSWORD</h1>
      <p className="text-sm text-muted mb-6">Choose a new password for your account.</p>

      <form onSubmit={handleSubmit} className="auth-form">
        <span className="input-span">
          <label htmlFor="password" className="form-label">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={72}
            required
          />
        </span>
        <span className="input-span">
          <label htmlFor="confirm" className="form-label">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            maxLength={72}
            required
          />
        </span>
        {error && <p className="text-loss text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="submit">
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>

      {expired && (
        <p className="text-xs mt-4">
          <Link href="/forgot-password" className="text-brand underline">
            Request a new link
          </Link>
        </p>
      )}
      <p className="text-xs text-muted mt-4">
        After resetting, withdrawals are paused for 24 hours as a security precaution.
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-muted pt-10 text-center">Loading…</p>}>
      <ResetForm />
    </Suspense>
  );
}