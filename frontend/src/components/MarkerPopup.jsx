import { useNavigate } from 'react-router'
import Checker from './Checker'
import '../styles/components/bottom-sheet.css'

export default function MarkerPopup({ buedchen, onClose }) {
  const navigate = useNavigate()

  const features = [
    buedchen.feature_seating && 'Außen',
    buedchen.feature_coffee  && 'Kaffee',
  ].filter(Boolean).join(' · ') || null

  return (
    <div className="bottom-sheet">
      <Checker small style={{ color: 'var(--creme)' }} />
      <div className="bottom-sheet__inner">
        <div className="bottom-sheet__meta">
          <span>{buedchen.veedel ?? '—'}</span>
          {buedchen.google_rating != null && (
            <span>★ {buedchen.google_rating.toFixed(1)}</span>
          )}
        </div>
        <div className="bottom-sheet__name">{buedchen.display_name ?? buedchen.name}</div>
        {buedchen.address && (
          <div className="bottom-sheet__info">{buedchen.address}</div>
        )}
        <div className="bottom-sheet__row">
          <span className="bottom-sheet__features">
            {features ?? 'Büdchen'}
          </span>
          <button
            className="bottom-sheet__btn"
            onClick={() => navigate(`/buedchen/${buedchen.id}`)}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  )
}
