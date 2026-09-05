"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function RegisterForm() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref") ?? "";

  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [refCodeInput, setRefCodeInput] = useState(refFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          referralCode: refCodeInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      setRegistered(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <div className="pt-16 text-center space-y-4">
        <h1 className="scoreboard text-3xl">CHECK YOUR EMAIL</h1>
        <p className="text-muted text-sm">
          We've sent a verification link to <span className="text-ink">{form.email}</span>. Click
          it to activate your account and log in — your 20,000 NGC bonus is already waiting.
        </p>
        <p className="text-xs text-muted">
          Didn't get it? Check spam, or head to the login page to resend it.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-1">JOIN NGOAT</h1>
      <p className="text-muted text-sm mb-6">Get 20,000 NGC free the moment you verify your email.</p>

      <form onSubmit={handleSubmit} className="auth-form">
        <span className="input-span">
          <label htmlFor="username" className="form-label">
            Username
          </label>
          <input
            id="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </span>
        <span className="input-span">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </span>
        <span className="input-span">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </span>
        <span className="input-span">
          <label htmlFor="refCode" className="form-label">
            Referral code (optional)
          </label>
          <input
            id="refCode"
            value={refCodeInput}
            onChange={(e) => setRefCodeInput(e.target.value)}
            placeholder="Got a code from a friend? Enter it here"
          />
        </span>
        {error && <p className="text-loss text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="submit">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<p className="text-muted pt-10 text-center">Loading…</p>}>
      <RegisterForm />
    </Suspense>
  );
}