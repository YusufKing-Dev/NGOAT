"use client";
import { useState } from "react";
import Link from "next/link";

const ERRORS: Record<string, string> = {
  WRONG_PASSWORD: "Your current password is incorrect.",
  SAME_PASSWORD: "Your new password must be different from the current one.",
  PASSWORD_TOO_SHORT: "New password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "New password can be at most 72 characters.",
  RATE_LIMITED: "Too many attempts. Please wait a while and try again.",
  TOO_SOON: "A confirmation email was just sent. Please wait a couple of minutes before requesting another.",
  UNAUTHENTICATED: "Please log in to change your password.",
};

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/change-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setSent(true);
      return;
    }
    if (res.status === 401) setNeedsLogin(true);
    setError(ERRORS[data.error] ?? "Something went wrong. Please try again.");
  }

  if (sent) {
    return (
      <div className="pt-8">
        <h1 className="scoreboard text-3xl mb-4">CHECK YOUR EMAIL</h1>
        <p className="text-sm text-muted">
          We sent a confirmation link to your email. Click it within 30 minutes to finish changing your
          password. Until then, your current password keeps working.
        </p>
        <p className="text-xs text-muted mt-3">
          Once confirmed, you'll be signed out everywhere and can log in with the new password.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-2">CHANGE PASSWORD</h1>
      <p className="text-sm text-muted mb-6">
        Enter your current password and pick a new one. We'll email you a link to confirm the change.
      </p>

      <form onSubmit={handleSubmit} className="auth-form">
        <span className="input-span">
          <label htmlFor="current" className="form-label">
            Current password
          </label>
          <input
            id="current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </span>
        <span className="input-span">
          <label htmlFor="next" className="form-label">
            New password
          </label>
          <input
            id="next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
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
        {needsLogin && (
          <p className="text-xs">
            <Link href="/login" className="text-brand underline">
              Go to log in
            </Link>
          </p>
        )}
        <button type="submit" disabled={loading} className="submit">
          {loading ? "Sending…" : "Email me a confirmation link"}
        </button>
      </form>
    </div>
  );
}