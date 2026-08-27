"use client";
import { useState } from "react";

const PAGES = [
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823013/1_hyjkvl.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823044/2_deiabs.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823087/3_dycwor.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823088/4_fzbzs1.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823088/5_figipd.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823088/6_mb2lzu.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823088/7_viwetz.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823089/8_d2ecth.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823089/9_xxdvaw.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823089/10_msdpc9.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823091/11_yeoi9x.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823092/12_sie9ri.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823092/13_ct7vbu.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823093/14_vufvzc.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823093/15_sb5klh.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823093/16_y8c5py.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823093/17_hcfcjb.png",
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787823094/18_oyewxc.png",
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