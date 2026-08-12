export default function StangeDoodle({ size = 42, color = 'var(--on-creme-dim)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Glas-Silhouette (Kölsch-Stange) */}
      <path d="M36 20 L64 20 L60 84 L40 84 Z" />
      {/* Füllstand */}
      <path d="M37 42 L63 42" />
    </svg>
  )
}
