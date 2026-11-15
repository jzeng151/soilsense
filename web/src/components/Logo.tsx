// The Soil Sense mark: Sprout on a Sprout Green disc (the brand kit's SMS avatar).
// Use this everywhere the product is named; the wordmark beside it is "Soil Sense" in Space Grotesk.
import avatar from "../assets/sprout/avatar.svg";

export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <img className={`logo-mark ${className}`} src={avatar} width={size} height={size} alt="" aria-hidden="true" />;
}

/** Decorative furrow arcs (kept for any panel that still uses them). */
export function FurrowArcs({ className = "" }: { className?: string }) {
  return (
    <svg className={`furrow-arcs ${className}`} viewBox="0 0 32 32" aria-hidden="true">
      <path className="arc-1" d="M6 22c6-1 9-5 10-12 1 7 4 11 10 12" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path className="arc-2" d="M2 26c8-1 12-6 14-15 2 9 6 14 14 15" strokeWidth=".8" fill="none" strokeLinecap="round" />
      <path className="arc-3" d="M-2 30c10-1 15-7 18-17 3 10 8 16 18 17" strokeWidth=".6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
