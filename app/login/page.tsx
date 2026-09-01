"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import LoadingRadar from "@/components/LoadingRadar";

const VERIFY_MESSAGES: Record<string, { text: string; tone: "brand" | "loss" }> = {
  success: { text: "Email verified! You can log in now.", tone: "brand" },
  already_done: { text: "That email was already verified — log in below.", tone: "brand" },
  expired: { text: "That verification link expired. Request a new one below.", tone: "loss" },
  invalid: { text: "That verification link isn't valid.", tone: "loss" },
  missing_token: { text: "Missing verification link.", tone: "loss" },
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyStatus = searchParams.get("verify");

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    const res = await signIn("credentials", { ...form, redirect: false });
    setLoading(false);
    if (res?.ok) {
      setRedirecting(true);
      router.push("/dashboard");
    } else if (res?.error === "EMAIL_NOT_VERIFIED") {
      setNeedsVerification(true);
      setError("Please verify your email before logging in.");
    } else {
      setError("Invalid email or password");
    }
  }

  async function resendVerification() {
    setResendStatus("Sending…");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email }),
    });
    setResendStatus("If that email is registered, a new verification link is on its way.");
  }

  if (redirecting) {
    return (
      <div className="pt-24 flex flex-col items-center gap-6">
        <LoadingRadar />
        <p className="text-muted text-sm">Taking you to your dashboard…</p>
      </div>
    );
  }

  const verifyMsg = verifyStatus ? VERIFY_MESSAGES[verifyStatus] : null;

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-6">LOG IN</h1>

      {verifyMsg && (
        <p className={`text-sm mb-4 ${verifyMsg.tone === "brand" ? "text-brand" : "text-loss"}`}>
          {verifyMsg.text}
        </p>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
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
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </span>
        {error && <p className="text-loss text-sm">{error}</p>}
        {needsVerification && (
          <div className="text-xs">
            <button type="button" onClick={resendVerification} className="text-brand underline">
              Resend verification email
            </button>
            {resendStatus && <p className="text-muted mt-1">{resendStatus}</p>}
          </div>
        )}
        <button type="submit" disabled={loading} className="submit">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-muted pt-10 text-center">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}