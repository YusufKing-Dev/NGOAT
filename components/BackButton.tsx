"use client";
import { useRouter, usePathname } from "next/navigation";

export default function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/") return null;

  return (
    <button
      onClick={() => router.back()}
      aria-label="Go back"
      className="w-8 h-8 flex items-center justify-center rounded-full bg-surface2 text-muted hover:text-brand transition"
    >
      ←
    </button>
  );
}