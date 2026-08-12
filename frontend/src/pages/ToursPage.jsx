import { useState, useEffect } from 'react'
import StatusStrip from '../components/StatusStrip'
import TourSegment from '../components/TourSegment'
import Checker from '../components/Checker'

export default function ToursPage() {
  const [tours, setTours]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tours')
      .then(r => r.json())
      .then(rows => { setTours(rows); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <>
      <StatusStrip context="Touren" liveText={loading ? '…' : `${tours.length} Routen`} />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 'var(--s-6)', scrollbarWidth: 'none' }}>

        {/* Section-Titel */}
        <div style={{ padding: 'var(--s-6) var(--seg-x) var(--s-5)', borderBottom: 'var(--line-hard)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', lineHeight: 'var(--lh-xl)', letterSpacing: '-.025em', textTransform: 'uppercase', color: 'var(--rot)' }}>
            Von Bude<br />zu Bude
          </h2>
          <p style={{ fontSize: '.6875rem', letterSpacing: '.06em', color: 'var(--on-creme-dim)', marginTop: 'var(--s-5)', lineHeight: 1.7 }}>
            Kuratierte Routen durchs Veedel. Zu Fuß, mit Pause.
          </p>
        </div>

        {loading && (
          <div style={{ padding: 'var(--s-6) var(--seg-x)', fontSize: '.75rem', color: 'var(--on-creme-dim)', letterSpacing: '.08em' }}>
            Lade Routen …
          </div>
        )}

        {tours.map((t, i) => (
          <TourSegment key={t.id} tour={t} index={i} />
        ))}

        <Checker style={{ color: 'var(--rot)' }} />
      </div>
    </>
  )
}
