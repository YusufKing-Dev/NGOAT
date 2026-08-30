"use client";
import { useState } from "react";

const PAGES = [
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021801/1_shpknt.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021801/2_nqlb3b.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021804/3_kxs1qw.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021801/4_qxv8va.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021802/5_t5pp5p.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021802/6_yviylj.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021804/7_m1debl.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021801/8_fdoela.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021801/9_kx0wtr.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021802/10_zxirg5.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021802/11_uk9eoo.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1788021803/12_icoi58.png",
];

export default function WhitepaperViewer() {
  const [page, setPage] = useState(0);

  return (
    <div>
      <div className="rounded-lg overflow-hidden border border-white/10 bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PAGES[page]}
          alt={`NGOAT whitepaper page ${page + 1}`}
          className="w-full h-auto"
        />
      </div>

      <div className="flex items-center justify-between mt-3">
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          disabled={page === 0}
          className="btn-secondary px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <span className="text-xs text-muted">
          Page {page + 1} of {PAGES.length}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(p + 1, PAGES.length - 1))}
          disabled={page === PAGES.length - 1}
          className="btn-secondary px-4 py-2 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  );
}