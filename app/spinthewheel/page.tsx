"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// Must match lib/games.ts SPIN_SEGMENTS exactly by LABEL — the order
// here is purely cosmetic (which slice of the wheel shows which
// value) and deliberately shuffled rather than sorted small-to-large,
// so the wheel doesn't read as a predictable gradient. The server
// decides which label wins independent of wheel position; the client
// just looks up whichever slice currently displays that label.
const SEGMENTS: { label: string; line1: string; line2: string; color: string }[] = [
  { label: "500", line1: "+500", line2: "NGC", color: "#008751" },
  { label: "2", line1: "+2", line2: "NGC", color: "#7C3AED" },
  { label: "5000", line1: "+5,000", line2: "NGC", color: "#0F1A2E" },
  { label: "0", line1: "0", line2: "NGC", color: "#008751" },
  { label: "1000", line1: "+1,000", line2: "NGC", color: "#7C3AED" },
  { label: "10", line1: "+10", line2: "NGC", color: "#0F1A2E" },
  { label: "BONUS", line1: "FREE", line2: "SPIN", color: "#008751" },
  { label: "5", line1: "+5", line2: "NGC", color: "#7C3AED" },
  { label: "2000", line1: "+2,000", line2: "NGC", color: "#0F1A2E" },
];

const SEGMENT_ANGLE = 360 / SEGMENTS.length;
const LOGO_URL =
  "https://res.cloudinary.com/drdrwbdkp/image/upload/v1787822761/IMG_20260827_102554_940_tcek9f.jpg";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function SpinTheWheelPage() {
  const { status } = useSession();
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [spinCost, setSpinCost] = useState(1000);
  const [freeSpins, setFreeSpins] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [recent, setRecent] = useState<any[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The wheel's rotation is driven directly via the DOM (not React
  // state) — relying on a state-driven inline style + a `spinning`
  // ternary for the transition can silently fail to animate, since
  // setSpinning(true) and the later setRotation(...) land in separate
  // renders across an async gap and the browser isn't guaranteed to
  // register the "transition just turned on" state before the target
  // value changes. Direct DOM control with an explicit reflow between
  // "reset to current angle, no transition" and "animate to target"
  // is the reliable way to guarantee the animation actually plays
  // every time.
  const wheelRef = useRef<SVGSVGElement>(null);
  const currentRotationRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  function load() {
    fetch("/api/games/spin")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setBalance(d.balance);
        setSpinCost(d.spinCost);
        setFreeSpins(d.freeSpinsAvailable);
        setEnabled(d.enabled);
        setRecent(d.recent ?? []);
      });
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") load();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [status, router]);

  function animateWheelTo(targetRotation: number) {
    const el = wheelRef.current;
    if (!el) return;
    // Snap to the current settled angle with no transition...
    el.style.transition = "none";
    el.style.transform = `rotate(${currentRotationRef.current}deg)`;
    // ...force the browser to actually register that snap...
    void el.getBoundingClientRect();
    // ...then, on the next frame, turn the transition on and animate
    // to the new target. This two-step handoff is what guarantees
    // the spin animation plays every single time.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
        el.style.transform = `rotate(${targetRotation}deg)`;
      });
    });
    currentRotationRef.current = targetRotation;
  }

  async function spin() {
    if (spinning) return;
    setError(null);
    setResultMsg(null);
    setSpinning(true);

    try {
      const res = await fetch("/api/games/spin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "INSUFFICIENT_BALANCE"
            ? "Not enough NGC to spin."
            : data.error === "GAME_DISABLED"
            ? "Spin the Wheel isn't live yet."
            : "Something went wrong."
        );
        setSpinning(false);
        return;
      }

      const segIndex = SEGMENTS.findIndex((s) => s.label === data.segment);
      const segCenterAngle = segIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
      const fullTurnsDone = currentRotationRef.current - (currentRotationRef.current % 360);
      const targetRotation = fullTurnsDone + 360 * 5 + ((360 - segCenterAngle) % 360);

      animateWheelTo(targetRotation);

      timeoutRef.current = setTimeout(() => {
        setResultMsg(
          data.grantsFreeSpin
            ? "🎁 Free Spin! Spin again, on the house."
            : data.payout > 0
            ? `You won ${data.payout.toLocaleString()} NGC!`
            : "No luck this time — spin again?"
        );
        setSpinning(false);
        load();
      }, 4200);
    } catch {
      setError("Network error.");
      setSpinning(false);
    }
  }

  const cx = 150;
  const cy = 150;
  const r = 145;
  const labelRadius = r * 0.72;

  return (
    <div className="pt-6 pb-10 flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="scoreboard text-3xl">SPIN THE WHEEL</h1>
        <p className="text-muted text-sm mt-1">
          {spinCost.toLocaleString()} NGC per spin · Balance: {balance.toLocaleString()} NGC
        </p>
        {freeSpins > 0 && (
          <p className="text-brand text-sm font-semibold mt-1">
            🎁 {freeSpins} free spin{freeSpins > 1 ? "s" : ""} available
          </p>
        )}
      </div>

      <div className="relative" style={{ width: 300, height: 300 }}>
        {/* Fixed pointer */}
        <div className="absolute left-1/2 -translate-x-1/2 z-10" style={{ top: -6 }}>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: "14px solid transparent",
              borderRight: "14px solid transparent",
              borderTop: "22px solid #00E676",
              filter: "drop-shadow(0 0 6px #00E676)",
            }}
          />
        </div>

        {/* Glowing outer ring */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ boxShadow: "0 0 24px 4px rgba(0,230,118,0.45)", border: "3px solid #00E676" }}
        />

        <svg ref={wheelRef} width="300" height="300" viewBox="0 0 300 300" style={{ transform: "rotate(0deg)" }}>
          {SEGMENTS.map((seg, i) => {
            const start = i * SEGMENT_ANGLE;
            const end = start + SEGMENT_ANGLE;
            const mid = start + SEGMENT_ANGLE / 2;
            const labelPos = polarToCartesian(cx, cy, labelRadius, mid);
            // Flip label right-side-up on the bottom half of the
            // wheel — otherwise text there reads upside-down once
            // rotated with its segment.
            const flipped = mid > 90 && mid < 270;
            const textRotation = flipped ? mid + 180 : mid;
            return (
              <g key={`${seg.label}-${i}`}>
                <path d={segmentPath(cx, cy, r, start, end)} fill={seg.color} stroke="#0A0F1C" strokeWidth={1.5} />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  fill="#F4F6F8"
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="middle"
                  transform={`rotate(${textRotation}, ${labelPos.x}, ${labelPos.y})`}
                >
                  <tspan x={labelPos.x} dy="-2">{seg.line1}</tspan>
                  <tspan x={labelPos.x} dy="11" fontSize="8" fontWeight="500" opacity={0.85}>
                    {seg.line2}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>

        {/* Center coin */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full overflow-hidden"
          style={{ width: 70, height: 70, border: "3px solid #FFD166", boxShadow: "0 0 14px rgba(255,209,102,0.7)" }}
        >
          <img src={LOGO_URL} alt="$NGOAT" className="w-full h-full object-cover" />
        </div>
      </div>

      {resultMsg && <p className="text-brand font-semibold text-center">{resultMsg}</p>}
      {error && <p className="text-loss text-sm text-center">{error}</p>}

      <button
        onClick={spin}
        disabled={spinning || !enabled}
        className="btn-primary px-10 py-3 rounded-full text-base"
      >
        {spinning ? "Spinning…" : freeSpins > 0 ? "FREE SPIN" : "SPIN NOW"}
      </button>

      {recent.length > 0 && (
        <div className="card w-full max-w-sm">
          <h2 className="text-xs text-muted uppercase tracking-wide mb-2">Recent spins</h2>
          <div className="space-y-1 text-sm">
            {recent.map((p) => (
              <div key={p.id} className="flex justify-between text-muted">
                <span>
                  {(() => {
                    const seg = SEGMENTS.find((s) => s.label === p.segmentLabel);
                    return seg ? `${seg.line1} ${seg.line2}` : p.segmentLabel;
                  })()}
                </span>
                <span className={p.payout > 0 ? "text-brand" : ""}>
                  {p.payout > 0 ? `+${p.payout.toLocaleString()}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}