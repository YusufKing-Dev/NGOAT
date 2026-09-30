"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.status === 429) {
      setIsError(true);
      setMessage("Too many requests. Please wait a while and try again.");
      return;
    }
    setIsError(false);
    setMessage(
      "If that email is registered, a reset link is on its way. It works for 30 minutes — check your spam folder too."
    );
  }

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-2">FORGOT PASSWORD</h1>
      <p className="text-sm text-muted mb-6">
        Enter your account email and we'll send you a link to set a new password.
      </p>

      <form onSubmit={handleSubmit} className="auth-form">
        <span className="input-span">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </span>
        {message && <p className={`text-sm ${isError ? "text-loss" : "text-brand"}`}>{message}</p>}
        <button type="submit" disabled={loading} className="submit">
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="text-xs text-muted mt-4">
        <Link href="/login" className="text-brand underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}