export default function BuedchenDoodle({ size = 72, color = 'var(--rot)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color}
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Wände */}
      <path d="M22 44 L22 82 L78 82 L78 44" />
      {/* Dach / Vordach */}
      <path d="M14 44 L86 44 L80 26 L20 26 Z" />
      {/* Tür */}
      <path d="M36 58 L64 58 L64 82 L36 82 Z" />
      {/* Fenster-Querstreben */}
      <path d="M30 34 L34 44 M44 34 L46 44 M58 34 L58 44 M70 34 L70 44" />
    </svg>
  )
}
