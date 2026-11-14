// The SoilSense furrow mark (brand guide v1.0). Colors come from tokens.css:
// tile = --color-brand-tile, furrow = --color-accent. Use this everywhere instead of copying the SVG.

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`logo-mark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect className="logo-tile" width="32" height="32" rx="7" />
      <path className="logo-furrow" d="M6 22c6-1 9-5 10-12 1 7 4 11 10 12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Decorative furrow arcs for brand panels. */
export function FurrowArcs({ className = "" }: { className?: string }) {
  return (
    <svg className={`furrow-arcs ${className}`} viewBox="0 0 32 32" aria-hidden="true">
      <path className="arc-1" d="M6 22c6-1 9-5 10-12 1 7 4 11 10 12" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path className="arc-2" d="M2 26c8-1 12-6 14-15 2 9 6 14 14 15" strokeWidth=".8" fill="none" strokeLinecap="round" />
      <path className="arc-3" d="M-2 30c10-1 15-7 18-17 3 10 8 16 18 17" strokeWidth=".6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
