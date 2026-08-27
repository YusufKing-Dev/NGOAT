"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import LoadingRadar from "@/components/LoadingRadar";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { ...form, redirect: false });
    setLoading(false);
    if (res?.ok) {
      setRedirecting(true);
      router.push("/dashboard");
    } else {
      setError("Invalid email or password");
    }
  }

  if (redirecting) {
    return (
      <div className="pt-24 flex flex-col items-center gap-6">
        <LoadingRadar />
        <p className="text-muted text-sm">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="pt-8">
      <h1 className="scoreboard text-3xl mb-6">LOG IN</h1>
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
        <button type="submit" disabled={loading} className="submit">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}