import { useState, useEffect } from 'react'
import { useParams } from 'react-router'
import { Clock, MapPin, Note, Star } from '@phosphor-icons/react'
import StatusStrip from '../components/StatusStrip'
import FloatBack from '../components/FloatBack'
import Checker from '../components/Checker'

const TAG_COLORS = ['var(--senf)', 'var(--pink)', 'var(--blau)']
const TAG_FG     = ['var(--tinte)', 'var(--tinte)', '#fff']

const TYPE_LABEL = {
  uferbüdchen:    'Uferbüdchen',
  platzbüdchen:   'Platzbüdchen',
  parkbüdchen:    'Parkbüdchen',
  straßenbüdchen: 'Büdchen',
}

// Geo-Typen werden im Hero angezeigt — aus Vibe-Tags rausfiltern
const GEO_TAGS = new Set(['platzbüdchen', 'parkbüdchen', 'uferbüdchen', 'straßenbüdchen'])

function typeLabel(type) {
  return TYPE_LABEL[type] ?? 'Büdchen'
}

function visibleCharacterTags(tags = [], buedchenType) {
  const filtered = tags.filter(t => !GEO_TAGS.has(t))
  // kultbüdchen nur zeigen wenn keine anderen spezifischen Tags vorhanden
  const specific = filtered.filter(t => t !== 'kultbüdchen')
  return specific.length > 0 ? specific : filtered
}

export default function DetailPage() {
  const { id }         = useParams()
  const [b, setB]      = useState(null)
  const [err, setErr]  = useState(null)

  useEffect(() => {
    fetch(`/api/buedchen/${id}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(setB)
      .catch(e => setErr(e.message))
  }, [id])

  if (err) return (
    <>
      <StatusStrip context="Detail" />
      <FloatBack />
      <div style={{ padding: 'var(--s-8) var(--seg-x)', color: 'var(--rot)' }}>
        Büdchen nicht gefunden.
      </div>
    </>
  )

  if (!b) return (
    <>
      <StatusStrip context="Detail" />
      <FloatBack />
    </>
  )

  const hours = b.opening_hours
  const features = [
    b.feature_seating && 'Außensitzplätze',
    b.feature_coffee  && 'Kaffee',
    !b.feature_seating && !b.feature_coffee && 'Keine Angabe',
  ].filter(Boolean).join(' · ')

  const veedel = b.veedel ?? '—'

  return (
    <>
      <StatusStrip context="Detail" liveText={veedel} />
      <FloatBack />
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 'var(--s-6)', scrollbarWidth: 'none' }}>

        {/* Hero */}
        <div style={{ background: 'var(--rot)', color: 'var(--on-rot)', padding: '112px var(--seg-x) 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .72, marginBottom: 'var(--s-5)' }}>
            <span>Veedel · {veedel}</span>
            <span>{typeLabel(b.buedchen_type)}</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', lineHeight: 'var(--lh-xl)', letterSpacing: '-.03em', textTransform: 'uppercase' }}>
            {b.name}
          </h1>
          {b.address && (
            <p style={{ fontSize: '.6875rem', letterSpacing: '.08em', opacity: .85, margin: 'var(--s-5) 0 var(--s-6)', lineHeight: 1.7 }}>
              {b.address}
            </p>
          )}
          <Checker style={{ color: 'var(--creme)', margin: '0 calc(-1 * var(--seg-x))' }} />
        </div>

        {/* Kennzahlen */}
        <div style={{ display: 'flex', borderBottom: 'var(--line-hard)' }}>
          {[
            { v: b.google_rating?.toFixed(1) ?? '–', l: 'Google' },
            { v: b.google_review_count ?? '–', l: 'Bewertungen', hi: true },
            { v: '–', l: 'Öffnungszeit' },
          ].map(({ v, l, hi }) => (
            <div key={l} style={{
              flex: '1 1 0',
              padding: 'var(--s-5) var(--s-3)',
              textAlign: 'center',
              borderRight: 'var(--line)',
              background: hi ? 'var(--tinte)' : undefined,
              color: hi ? 'var(--on-tinte)' : undefined,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', lineHeight: 'var(--lh-md)' }}>{v}</div>
              <div style={{ fontSize: '.5625rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: hi ? 'var(--on-tinte)' : 'var(--on-creme-dim)', opacity: hi ? .65 : 1, marginTop: 9 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* KI-Summary */}
        {b.ai_summary && (
          <div style={{
            padding: 'var(--s-6) var(--seg-x)',
            borderBottom: 'var(--line-hard)',
            background: 'var(--creme-deep)',
          }}>
            <div style={{ fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--on-creme-dim)', marginBottom: 'var(--s-3)' }}>
              Charakter
            </div>
            <p style={{ fontSize: '.8125rem', lineHeight: 1.75, letterSpacing: '.02em', margin: 0 }}>
              {b.ai_summary}
            </p>
          </div>
        )}

        {/* Info-Segment */}
        <div style={{ borderBottom: 'var(--line-hard)' }}>
          {hours && (
            <InfoRow icon={<Clock weight="fill" size={16} />} label="Öffnungszeiten">
              {typeof hours === 'object' && !Array.isArray(hours)
                ? Object.entries(hours).map(([k, v]) => <span key={k}>{k} {v}<br /></span>)
                : String(hours)
              }
            </InfoRow>
          )}
          {b.address && (
            <InfoRow icon={<MapPin weight="fill" size={16} />} label="Adresse">
              {b.address}
              {b.google_place_id && (
                <><br /><a
                  style={{ color: 'var(--rot)', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  href={`https://maps.google.com/?cid=${b.google_place_id}`}
                  target="_blank"
                  rel="noreferrer"
                >In Google Maps öffnen</a></>
              )}
            </InfoRow>
          )}
          <InfoRow icon={<Note weight="fill" size={16} />} label="Ausstattung">
            {features}
          </InfoRow>
        </div>

        {/* Redaktionell */}
        {b.editorial_badges?.length > 0 && (
          <div style={{
            background: 'var(--tinte)',
            color: 'var(--on-tinte)',
            padding: 'var(--s-5) var(--seg-x)',
            display: 'flex',
            gap: 'var(--s-4)',
            alignItems: 'center',
            borderBottom: 'var(--line-hard)',
          }}>
            <Star weight="fill" size={26} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '.8125rem', textTransform: 'uppercase', lineHeight: 'var(--lh-md)' }}>
                Redaktionell empfohlen
              </div>
              <div style={{ fontSize: '.625rem', letterSpacing: '.1em', opacity: .72, marginTop: 7, textTransform: 'uppercase' }}>
                {b.editorial_badges.join(' · ')}
              </div>
            </div>
          </div>
        )}

        {/* Tags */}
        {b.tags?.length > 0 && (
          <div style={{ padding: 'var(--s-5) var(--seg-x)', borderBottom: 'var(--line-hard)', display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
            {b.tags.map((tag, i) => (
              <span key={tag} style={{
                fontSize: '.625rem',
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                padding: '7px 11px',
                borderRadius: 'var(--r-1)',
                background: TAG_COLORS[i % TAG_COLORS.length],
                color: TAG_FG[i % TAG_FG.length],
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* KI-Tags */}
        {(() => {
          const tags = visibleCharacterTags(b.character_tags, b.buedchen_type)
          return tags.length > 0 && (
          <div style={{ padding: 'var(--s-5) var(--seg-x)', borderBottom: 'var(--line-hard)' }}>
            <div style={{ fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--on-creme-dim)', marginBottom: 'var(--s-4)' }}>
              Vibe
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
              {tags.map((tag, i) => (
                <span key={tag} style={{
                  fontSize: '.625rem',
                  fontWeight: 700,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  padding: '7px 11px',
                  borderRadius: 'var(--r-1)',
                  background: TAG_COLORS[i % TAG_COLORS.length],
                  color: TAG_FG[i % TAG_FG.length],
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )})()}

      </div>
    </>
  )
}

function InfoRow({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'flex-start', padding: 'var(--s-5) var(--seg-x)', borderBottom: 'var(--line)' }}>
      <span style={{ color: 'var(--rot)', marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: '.5875rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--on-creme-dim)' }}>{label}</div>
        <div style={{ fontSize: '.75rem', marginTop: 7, lineHeight: 1.75, letterSpacing: '.03em' }}>{children}</div>
      </div>
    </div>
  )
}
