"use client";
import { useEffect, useState } from "react";
import WhitepaperViewer from "./WhitepaperViewer";

export default function WhitepaperModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary w-full">
        Read Whitepaper
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close whitepaper"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-surface2 text-muted hover:text-brand transition"
            >
              ✕
            </button>
            <h2 className="scoreboard text-2xl mb-4 pr-8">WHITEPAPER</h2>
            <WhitepaperViewer />
          </div>
        </div>
      )}
    </>
  );
}