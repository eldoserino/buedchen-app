import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  MapPin, MagnifyingGlass, Tree, SunHorizon, BeerBottle,
} from '@phosphor-icons/react'
import StatusStrip from '../components/StatusStrip'

const THEMES = [
  { id: 'entdecken', label: 'Besonderes entdecken', Icon: MagnifyingGlass },
  { id: 'veedel',    label: 'Schöne Ecken',          Icon: Tree           },
  { id: 'abhängen',  label: 'Zwischendurch abhängen', Icon: SunHorizon    },
  { id: 'klassiker', label: 'Kölsch-Klassiker',       Icon: BeerBottle    },
]

const RADII = [
  { value: 500,  label: '500 m' },
  { value: 1000, label: '1 km'  },
  { value: 2000, label: '2 km'  },
]

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ' Köln')}&format=json&limit=1&accept-language=de&countrycodes=de`
  const res  = await fetch(url)
  const data = await res.json()
  if (!data?.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export default function ToursPage() {
  const navigate = useNavigate()

  const [coords,       setCoords]       = useState(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [addressInput,  setAddressInput]  = useState('')
  const [radius,        setRadius]        = useState(1000)
  const [themes,        setThemes]        = useState([])
  const [loading,       setLoading]       = useState(false)
  const [geoLoading,    setGeoLoading]    = useState(false)
  const [error,         setError]         = useState(null)

  function handleGeolocate() {
    if (!navigator.geolocation) {
      setError('Geolocation wird von diesem Browser nicht unterstützt.')
      return
    }
    setGeoLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationLabel('Standort erkannt')
        setAddressInput('')
        setGeoLoading(false)
      },
      () => {
        setError('Standort konnte nicht ermittelt werden. Bitte Adresse eingeben.')
        setGeoLoading(false)
      },
      { timeout: 8000 }
    )
  }

  function toggleTheme(id) {
    setThemes(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id)
      if (prev.length >= 2)  return prev
      return [...prev, id]
    })
  }

  async function handleGenerate() {
    setError(null)

    let finalCoords = coords
    if (!finalCoords && addressInput.trim()) {
      setLoading(true)
      try {
        finalCoords = await geocodeAddress(addressInput.trim())
        if (!finalCoords) {
          setError('Adresse nicht gefunden. Bitte genauer eingeben.')
          setLoading(false)
          return
        }
        setCoords(finalCoords)
      } catch {
        setError('Adresse konnte nicht aufgelöst werden.')
        setLoading(false)
        return
      }
    }

    if (!finalCoords) {
      setError('Bitte einen Standort auswählen.')
      return
    }
    if (themes.length === 0) {
      setError('Bitte mindestens ein Thema auswählen.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/route/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          start_lat:    finalCoords.lat,
          start_lng:    finalCoords.lng,
          radius_m:     radius,
          themes,
          include_pois: true,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.message ?? 'Route konnte nicht berechnet werden.')
        setLoading(false)
        return
      }
      navigate('/touren/generiert', { state: data })
    } catch {
      setError('Verbindungsfehler. Bitte versuche es erneut.')
      setLoading(false)
    }
  }

  return (
    <>
      <StatusStrip context="Touren" liveText="Route planen" />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 'var(--s-6)', scrollbarWidth: 'none' }}>

        {/* Headline */}
        <div style={{ padding: 'var(--s-6) var(--seg-x) var(--s-5)', borderBottom: 'var(--line-hard)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', lineHeight: 'var(--lh-xl)', letterSpacing: '-.025em', textTransform: 'uppercase', color: 'var(--rot)' }}>
            Deine<br />Route
          </h2>
          <p style={{ fontSize: '.6875rem', letterSpacing: '.06em', color: 'var(--on-creme-dim)', marginTop: 'var(--s-5)', lineHeight: 1.7 }}>
            Wähle deinen Startpunkt und ein Thema.
          </p>
        </div>

        {/* Standort */}
        <div style={{ background: 'var(--creme-deep)', borderBottom: 'var(--line-hard)' }}>
          <div style={{ padding: 'var(--s-5) var(--seg-x) var(--s-3)', fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--on-creme-dim)' }}>
            Startpunkt
          </div>

          {/* Geolocation-Button */}
          <button
            onClick={handleGeolocate}
            disabled={geoLoading}
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         'var(--s-3)',
              width:       '100%',
              padding:     'var(--s-4) var(--seg-x)',
              background:  coords && !addressInput ? 'var(--tinte)' : 'transparent',
              color:       coords && !addressInput ? 'var(--on-tinte)' : 'var(--on-creme)',
              border:      'none',
              borderBottom: 'var(--line)',
              cursor:      geoLoading ? 'wait' : 'pointer',
              textAlign:   'left',
            }}
          >
            <MapPin weight="fill" size={18} style={{ flexShrink: 0, color: coords && !addressInput ? 'var(--on-tinte)' : 'var(--rot)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 500, letterSpacing: '.04em' }}>
              {geoLoading
                ? 'Standort wird ermittelt …'
                : (coords && !addressInput)
                  ? locationLabel || 'Standort erkannt'
                  : 'Meinen Standort verwenden'}
            </span>
          </button>

          {/* Adress-Input */}
          <div style={{ padding: 'var(--s-3) var(--seg-x) var(--s-5)', display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
            <input
              type="text"
              placeholder="Oder Adresse eingeben …"
              value={addressInput}
              onChange={e => {
                setAddressInput(e.target.value)
                if (e.target.value) setCoords(null)
              }}
              style={{
                flex:        1,
                background:  'transparent',
                border:      'none',
                borderBottom: '1px solid rgba(22,18,12,.25)',
                padding:     '8px 0',
                fontFamily:  'var(--font-mono)',
                fontSize:    '.75rem',
                color:       'var(--on-creme)',
                outline:     'none',
                letterSpacing: '.03em',
              }}
            />
          </div>
        </div>

        {/* Radius */}
        <div style={{ background: 'var(--creme-deep)', borderBottom: 'var(--line-hard)' }}>
          <div style={{ padding: 'var(--s-5) var(--seg-x) var(--s-3)', fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--on-creme-dim)' }}>
            Radius
          </div>
          <div className="chips" style={{ background: 'transparent', borderBottom: 'none' }}>
            {RADII.map(r => (
              <button
                key={r.value}
                onClick={() => setRadius(r.value)}
                className={`chip${radius === r.value ? ' active-rot' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Themen */}
        <div style={{ background: 'var(--creme-deep)', borderBottom: 'var(--line-hard)' }}>
          <div style={{ padding: 'var(--s-5) var(--seg-x) var(--s-3)', fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--on-creme-dim)' }}>
            Thema <span style={{ opacity: .6 }}>(bis zu 2)</span>
          </div>
          <div style={{ padding: '0 var(--seg-x) var(--s-5)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
            {THEMES.map(({ id, label, Icon }) => {
              const active   = themes.includes(id)
              const disabled = !active && themes.length >= 2
              return (
                <button
                  key={id}
                  onClick={() => !disabled && toggleTheme(id)}
                  disabled={disabled}
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         'var(--s-3)',
                    padding:     '12px var(--s-4)',
                    border:      '1px solid var(--tinte)',
                    borderRadius: 'var(--r-1)',
                    background:  active ? 'var(--rot)' : 'transparent',
                    color:       active ? 'var(--on-rot)' : disabled ? 'var(--on-creme-dim)' : 'var(--on-creme)',
                    cursor:      disabled ? 'not-allowed' : 'pointer',
                    opacity:     disabled ? .45 : 1,
                    borderColor: active ? 'var(--rot)' : disabled ? 'rgba(22,18,12,.2)' : 'var(--tinte)',
                    textAlign:   'left',
                    fontFamily:  'var(--font-mono)',
                    fontSize:    '.75rem',
                    fontWeight:  500,
                    letterSpacing: '.04em',
                    transition:  'all 130ms',
                  }}
                >
                  <Icon weight="fill" size={17} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: 'var(--s-4) var(--seg-x)', background: 'var(--rot)', color: 'var(--on-rot)', fontSize: '.75rem', letterSpacing: '.03em', borderBottom: 'var(--line-hard)' }}>
            {error}
          </div>
        )}

        {/* Generate-Button */}
        <div style={{ padding: 'var(--s-5) var(--seg-x)' }}>
          <button
            onClick={handleGenerate}
            disabled={loading || geoLoading}
            style={{
              width:       '100%',
              padding:     '18px var(--seg-x)',
              background:  loading ? 'var(--on-creme-dim)' : 'var(--rot)',
              color:       'var(--on-rot)',
              border:      'none',
              cursor:      loading || geoLoading ? 'wait' : 'pointer',
              fontFamily:  'var(--font-mono)',
              fontSize:    '.8125rem',
              fontWeight:  700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              transition:  'background 130ms',
            }}
          >
            {loading ? 'Wird berechnet …' : 'Route berechnen'}
          </button>
        </div>
      </div>
    </>
  )
}
