import { CAT_COLOR } from "@/lib/catalog";

const PATHS = {
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  gpu: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.5" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10v4M21 17v2a1 1 0 0 1-1 1h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  ram: (
    <>
      <rect x="4" y="5" width="16" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 18v3M12 18v3M16 18v3M7 9v4M11 9v4M15 9v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  ssd: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="12.5" r="1.3" fill="currentColor" />
      <path d="M12 12.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="4" width="16" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 19h20l-1.6-3H3.6L2 19Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
  mobo: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="6" y="6" width="5" height="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 6h4M14 9h4M6 14h12M6 17h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  psu: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10v4M11 10v4M14 10l3 4M17 10l-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  peripheral: (
    <>
      <rect x="7" y="3" width="10" height="17" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  case: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="6" r="1" fill="currentColor" />
      <path d="M9 10h6M9 13h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
};

export default function CategoryIcon({ cat, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: CAT_COLOR[cat] }}>
      {PATHS[cat] || PATHS.cpu}
    </svg>
  );
}
