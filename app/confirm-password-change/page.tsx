"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ConfirmForm() {
  const token = useSearchParams().get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The change is applied by a button press, not on page load, so email
  // security scanners that pre-open links can't trigger it by accident.
  async function confirm() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/change-password/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    setError(
      data.error === "RATE_LIMITED"
        ? "Too many attempts. Please wait a few minutes and try again."
        : "This confirmation link is invalid or has expired. Start the change again from Change Password."
    );
  }

  if (!token) {
    return (
      <div className="pt-8">
        <h1 className="scoreboard text-3xl mb-4">CONFIRM CHANGE</h1>
        <p className="text-sm text-loss">This link is missing its token. Please use the link from your email.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="pt-8">
        <h1 className="scoreboard text-3xl mb-4">PASSWORD CHANGED</h1>
        <p className="text-sm text-muted">Your password has been updated and other devices were signed out.</p>
        <p className="mt-4">
          <Link href="/login?reset=success" className="text-brand underline text-sm">
            Log in with your new password
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-2">CONFIRM CHANGE</h1>
      <p className="text-sm text-muted mb-6">
        Press the button to finish changing your NGOAT password.
      </p>
      {error && <p className="text-loss text-sm mb-3">{error}</p>}
      <button onClick={confirm} disabled={loading} className="btn-primary w-full disabled:opacity-40">
        {loading ? "Confirming…" : "Confirm password change"}
      </button>
    </div>
  );
}

export default function ConfirmPasswordChangePage() {
  return (
    <Suspense fallback={<p className="text-muted pt-10 text-center">Loading…</p>}>
      <ConfirmForm />
    </Suspense>
  );
}