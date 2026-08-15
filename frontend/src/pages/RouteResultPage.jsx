import { useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Tree, Waves, Footprints, Timer, MagnifyingGlass, SunHorizon, BeerBottle } from '@phosphor-icons/react'
import StatusStrip from '../components/StatusStrip'
import FloatBack from '../components/FloatBack'

// GeoJSON [lng, lat] → Leaflet [lat, lng]
function geoToLeaflet(coords) {
  return coords.map(([lng, lat]) => [lat, lng])
}

function createBuedchenPin(num) {
  const html = `<div style="
    width:32px;height:32px;
    background:var(--rot);color:var(--on-rot);
    border:1px solid var(--tinte);
    display:grid;place-items:center;
    font-family:var(--font-display);font-size:.75rem;line-height:1;"
  >${num}</div>`
  return L.divIcon({ className: '', html, iconSize: [32, 32], iconAnchor: [16, 32] })
}

const CAT_LABEL = {
  park:      'P',
  platz:     'Pl',
  rhein:     '~',
  aussicht:  'A',
  markt:     'M',
  denkmal:   'D',
  streetart: 'St',
}

function createPoiPin(category) {
  const label = CAT_LABEL[category] ?? '·'
  const html  = `<div style="
    width:26px;height:26px;
    background:var(--tinte);color:var(--on-tinte);
    border:1px solid rgba(253,246,228,.22);
    display:grid;place-items:center;
    font-family:var(--font-mono);font-size:.625rem;font-weight:700;line-height:1;"
  >${label}</div>`
  return L.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 26] })
}

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [48, 48] })
    }
  }, [map])
  return null
}

const CAT_ICON = {
  park:     Tree,
  platz:    MapPin,
  rhein:    Waves,
  default:  MapPin,
}

const CAT_NAME = {
  park:      'Park',
  platz:     'Platz',
  rhein:     'Rhein',
  aussicht:  'Aussicht',
  markt:     'Markt',
  denkmal:   'Denkmal',
  streetart: 'Streetart',
}

const THEME_ICONS = {
  'Besonderes entdecken':   MagnifyingGlass,
  'Schöne Ecken':           Tree,
  'Zwischendurch abhängen': SunHorizon,
  'Kölsch-Klassiker':       BeerBottle,
}

function fmtDist(m) {
  return m >= 1000
    ? `${(m / 1000).toFixed(1).replace('.', ',')} km`
    : `${m} m`
}

export default function RouteResultPage() {
  const location = useLocation()
  const navigate  = useNavigate()
  const data      = location.state

  useEffect(() => {
    if (!data?.stops) navigate('/touren', { replace: true })
  }, [data, navigate])

  if (!data?.stops) return null

  // Leaflet-Koordinaten für alle Stopps
  const allLeafletCoords = data.stops.map(s => [s.lat, s.lng])

  // Polyline: ORS-GeoJSON → Leaflet oder Fallback
  const polyCoords = data.route_geojson?.coordinates?.length
    ? geoToLeaflet(data.route_geojson.coordinates)
    : allLeafletCoords

  // Durchnummerierung nur für Büdchen-Stopps
  let bNum = 0
  const stopsWithNum = data.stops.map(s => ({
    ...s,
    num: s.type === 'buedchen' ? ++bNum : null,
  }))

  return (
    <>
      <StatusStrip context="Route" liveText={(data.theme_labels ?? []).join(' · ')} />
      <FloatBack />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Karte */}
        <div style={{ height: 340, flexShrink: 0 }}>
          <MapContainer center={[50.938, 6.960]} zoom={13} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            <Polyline
              positions={polyCoords}
              color="var(--rot)"
              weight={3}
              dashArray={data.is_fallback ? '8, 6' : undefined}
            />
            {stopsWithNum.map((s, i) =>
              s.type === 'buedchen'
                ? <Marker key={`b${i}`} position={[s.lat, s.lng]} icon={createBuedchenPin(s.num)} />
                : <Marker key={`p${i}`} position={[s.lat, s.lng]} icon={createPoiPin(s.category)} />
            )}
            <FitBounds positions={allLeafletCoords} />
          </MapContainer>
        </div>

        {/* Inhalt scrollbar */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>

          {/* Stop-Liste */}
          {stopsWithNum.map((s, i) => (
            s.type === 'buedchen'
              ? <BuedchenStop key={i} stop={s} />
              : <PoiStop       key={i} stop={s} />
          ))}

          {/* Meta */}
          <RouteMeta data={data} />

        </div>
      </div>
    </>
  )
}

function BuedchenStop({ stop }) {
  return (
    <Link
      to={`/buedchen/${stop.id}`}
      style={{
        display:        'flex',
        gap:            'var(--s-4)',
        alignItems:     'flex-start',
        padding:        'var(--s-5) var(--seg-x)',
        borderBottom:   'var(--line-hard)',
        textDecoration: 'none',
        color:          'var(--on-creme)',
      }}
    >
      <div style={{
        width: 30, height: 30, flexShrink: 0, marginTop: 2,
        background: 'var(--rot)', color: 'var(--on-rot)',
        border: 'var(--line-hard)',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-display)', fontSize: '.7rem',
      }}>
        {stop.num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '.95rem', textTransform: 'uppercase', lineHeight: 'var(--lh-md)' }}>
          {stop.display_name ?? stop.name}
        </div>
        {stop.veedel && (
          <div style={{ fontSize: '.5875rem', letterSpacing: '.12em', color: 'var(--on-creme-dim)', marginTop: 4, textTransform: 'uppercase' }}>
            {stop.veedel}
          </div>
        )}
        {stop.summary && (
          <p style={{ margin: '8px 0 0', fontSize: '.75rem', fontStyle: 'italic', lineHeight: 1.65, letterSpacing: '.02em', color: 'var(--on-creme)' }}>
            {stop.summary}
          </p>
        )}
      </div>
    </Link>
  )
}

function PoiStop({ stop }) {
  const Icon     = CAT_ICON[stop.category] ?? CAT_ICON.default
  const catLabel = CAT_NAME[stop.category] ?? stop.category

  return (
    <div style={{
      display:      'flex',
      gap:          'var(--s-4)',
      alignItems:   'center',
      padding:      'var(--s-4) var(--seg-x)',
      borderBottom: 'var(--line)',
      background:   'var(--creme-deep)',
    }}>
      <div style={{
        width: 28, height: 28, flexShrink: 0,
        background: 'var(--tinte)', color: 'var(--on-tinte)',
        border: 'var(--line-hard)',
        display: 'grid', placeItems: 'center',
      }}>
        <Icon weight="fill" size={14} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 500, letterSpacing: '.03em' }}>
          {stop.display_name ?? stop.name}
        </div>
        <div style={{ fontSize: '.5875rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--on-creme-dim)', marginTop: 3 }}>
          {catLabel}
        </div>
      </div>
    </div>
  )
}

function RouteMeta({ data }) {
  const themes = data.theme_labels ?? []

  return (
    <div style={{ borderTop: 'var(--line-hard)', background: 'var(--tinte)', color: 'var(--on-tinte)', padding: 'var(--s-5) var(--seg-x)' }}>
      <div style={{ fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .6, marginBottom: 'var(--s-4)' }}>
        Route
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-6)', flexWrap: 'wrap' }}>
        {data.total_distance_m > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '.75rem', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>
            <Footprints weight="fill" size={16} />
            {fmtDist(data.total_distance_m)}
          </span>
        )}
        {data.estimated_time_min > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: '.75rem', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>
            <Timer weight="fill" size={16} />
            {data.estimated_time_min} Min.
          </span>
        )}
      </div>
      {themes.length > 0 && (
        <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
          {themes.map(label => {
            const Icon = THEME_ICONS[label]
            return (
              <span key={label} style={{
                display:     'flex',
                alignItems:  'center',
                gap:         'var(--s-2)',
                fontSize:    '.625rem',
                fontFamily:  'var(--font-mono)',
                fontWeight:  700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                opacity:     .75,
              }}>
                {Icon && <Icon weight="fill" size={13} />}
                {label}
              </span>
            )
          })}
        </div>
      )}
      {data.is_fallback && (
        <div style={{ marginTop: 'var(--s-3)', fontSize: '.625rem', letterSpacing: '.06em', opacity: .5, fontFamily: 'var(--font-mono)' }}>
          Luftlinien-Route · kein ORS-Signal
        </div>
      )}
    </div>
  )
}
