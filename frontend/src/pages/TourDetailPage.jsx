import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Clock } from '@phosphor-icons/react'
import StatusStrip from '../components/StatusStrip'
import FloatBack from '../components/FloatBack'

function createStopIcon(num) {
  const html = `<div style="
    width:32px;height:32px;
    background:var(--rot);color:var(--on-rot);
    border:1px solid var(--tinte);
    display:grid;place-items:center;
    font-family:var(--font-display);font-size:.75rem;line-height:1;"
  >${num}</div>`
  return L.divIcon({ className: '', html, iconSize: [32, 32], iconAnchor: [16, 32] })
}

function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] })
    }
  }, [map, coords])
  return null
}

export default function TourDetailPage() {
  const { slug }           = useParams()
  const [tour, setTour]    = useState(null)
  const [selected, setSel] = useState(null)

  useEffect(() => {
    fetch(`/api/tours/${slug}`)
      .then(r => r.json())
      .then(setTour)
      .catch(() => {})
  }, [slug])

  if (!tour) return (
    <>
      <StatusStrip context="Touren" />
      <FloatBack />
    </>
  )

  const coords = (tour.buedchen ?? []).map(b => [b.lat, b.lng])

  return (
    <>
      <StatusStrip context="Tour" liveText={tour.title} />
      <FloatBack />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Karte */}
        <div style={{ height: 320, flexShrink: 0 }}>
          <MapContainer
            center={[50.938, 6.960]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {coords.length > 1 && (
              <Polyline positions={coords} color="var(--rot)" weight={3} />
            )}
            {tour.buedchen?.map((b, i) => (
              <Marker
                key={b.id}
                position={[b.lat, b.lng]}
                icon={createStopIcon(i + 1)}
                eventHandlers={{ click: () => setSel(b) }}
              />
            ))}
            <FitBounds coords={coords} />
          </MapContainer>
        </div>

        {/* Stopp-Liste */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
          <div style={{ padding: 'var(--s-5) var(--seg-x)', borderBottom: 'var(--line-hard)', display: 'flex', gap: 'var(--s-5)', fontSize: '.625rem', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--on-creme-dim)' }}>
            {tour.estimated_time && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock weight="fill" size={13} />
                {tour.estimated_time}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin weight="fill" size={13} />
              {tour.buedchen?.length ?? 0} Stopps
            </span>
          </div>

          {tour.buedchen?.map((b, i) => (
            <Link
              key={b.id}
              to={`/buedchen/${b.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-4)',
                padding: 'var(--s-4) var(--seg-x)',
                borderBottom: 'var(--line)',
                background: selected?.id === b.id ? 'var(--creme-deep)' : undefined,
                textDecoration: 'none',
                color: 'var(--on-creme)',
              }}
            >
              <div style={{
                width: 28, height: 28, flexShrink: 0,
                background: 'var(--rot)', color: 'var(--on-rot)',
                border: 'var(--line-hard)',
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--font-display)', fontSize: '.7rem',
              }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '.9rem', textTransform: 'uppercase', lineHeight: 'var(--lh-md)' }}>{b.name}</div>
                {b.veedel && <div style={{ fontSize: '.5875rem', letterSpacing: '.12em', color: 'var(--on-creme-dim)', marginTop: 4 }}>{b.veedel}</div>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
