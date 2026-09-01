"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINKS = [
  { href: "/", label: "Homepage" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/predict", label: "Prediction" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/stake", label: "Stake" },
];

export default function NavMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // These links are all "use case" app pages — they don't belong on
  // the coin marketing homepage, so the whole menu is hidden there.
  if (pathname === "/") return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open menu"
        className="w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-lg bg-surface2"
      >
        <span className="block w-4 h-0.5 bg-ink" />
        <span className="block w-4 h-0.5 bg-ink" />
        <span className="block w-4 h-0.5 bg-ink" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-48 card p-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-ink hover:bg-surface2 transition"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-white/10 mt-1 pt-1">
              <button
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/" });
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-loss hover:bg-surface2 transition"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}