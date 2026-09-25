"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    turnstile?: {
      render: (
        selector: string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        }
      ) => void;
    };
  }
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref") ?? "";

  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [refCodeInput, setRefCodeInput] = useState(refFromUrl);
  const [website, setWebsite] = useState(""); // honeypot — real users never see or fill this
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [signupBonus, setSignupBonus] = useState(20000);

  const ERROR_MESSAGES: Record<string, string> = {
    INVALID_INPUT: "Please fill in every field (password needs at least 8 characters).",
    INVALID_EMAIL: "Please use a Gmail, Outlook, Yahoo, Proton, Hotmail, or iCloud address.",
    DISPOSABLE_EMAIL: "Please use a permanent email address — temporary/disposable addresses aren't accepted.",
    USER_ALREADY_EXISTS: "That email or username is already registered.",
    RATE_LIMITED: "Too many attempts from this connection. Please try again in a little while.",
    TURNSTILE_FAILED: "Verification check failed — please try again.",
  };

  useEffect(() => {
    // Reflect the admin's live signup bonus, never a hardcoded copy
    // that can drift out of sync with what actually gets paid.
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setSignupBonus(d.signupBonusCredits ?? 20000));
  }, []);

  useEffect(() => {
    // The Turnstile script is loaded globally in app/layout.tsx. It
    // may not be ready the instant this component mounts, so poll
    // briefly until window.turnstile exists, then render the widget
    // once into the mount point below.
    const id = setInterval(() => {
      if (window.turnstile) {
        window.turnstile.render("#turnstile-widget", {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY as string,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
        });
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

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
          website,
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_MESSAGES[data.error] ?? "Something went wrong");
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
          it to activate your account and log in — your {signupBonus.toLocaleString()} NGC bonus
          is already waiting.
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
      <p className="text-muted text-sm mb-6">
        Get {signupBonus.toLocaleString()} NGC free the moment you verify your email.
      </p>

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
        {/* Honeypot — invisible to real users, tabIndex/aria-hidden keep
            it out of keyboard and screen-reader navigation. Simple bots
            that fill every field in the DOM trip this; humans never do. */}
        <span
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
        >
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </span>
        {/* Cloudflare Turnstile — script loaded globally in
            app/layout.tsx, widget rendered into this div by the
            useEffect above. Submit stays disabled until it resolves. */}
        <div id="turnstile-widget" className="my-2" />
        <button type="submit" disabled={loading || !turnstileToken} className="submit">
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
