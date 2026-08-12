import { Link } from 'react-router'
import { MapPin, Clock } from '@phosphor-icons/react'

const TOUR_COLORS = ['rot', 'tinte', 'creme']

export default function TourSegment({ tour, index }) {
  const color    = TOUR_COLORS[index % TOUR_COLORS.length]
  const routeNum = String(index + 1).padStart(2, '0')

  const colorVars = {
    rot:   { bg: 'var(--rot)',        fg: 'var(--on-rot)',   line: 'var(--line-on)' },
    tinte: { bg: 'var(--tinte)',      fg: 'var(--on-tinte)', line: 'var(--line-on)' },
    creme: { bg: 'var(--creme-deep)', fg: 'var(--on-creme)', line: 'var(--line)' },
  }[color]

  return (
    <Link
      to={`/touren/${tour.slug}`}
      style={{
        display: 'block',
        padding: 'var(--seg-y) var(--seg-x)',
        borderBottom: `1px solid ${colorVars.line}`,
        background: colorVars.bg,
        color: colorVars.fg,
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '.5875rem',
        fontWeight: 700,
        letterSpacing: '.16em',
        textTransform: 'uppercase',
        opacity: .72,
        marginBottom: 'var(--s-5)',
      }}>
        <span>Route {routeNum}</span>
        <span>{tour.veedel ?? ''}</span>
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.55rem',
        lineHeight: 'var(--lh-lg)',
        letterSpacing: '-.02em',
        textTransform: 'uppercase',
      }}>
        {tour.title}
      </div>
      {tour.description && (
        <p style={{
          fontSize: '.6875rem',
          letterSpacing: '.05em',
          opacity: .85,
          marginTop: 'var(--s-5)',
          lineHeight: 1.75,
        }}>
          {tour.description}
        </p>
      )}
      <div style={{
        display: 'flex',
        gap: 'var(--s-5)',
        marginTop: 'var(--s-5)',
        fontSize: '.625rem',
        fontWeight: 700,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
      }}>
        {tour.stop_count != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin weight="fill" size={13} />
            {tour.stop_count} Stopps
          </span>
        )}
        {tour.estimated_time && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock weight="fill" size={13} />
            {tour.estimated_time}
          </span>
        )}
      </div>
    </Link>
  )
}
