import { useStats } from '../hooks/useFilteredBuedchen'
import '../styles/components/status-strip.css'

export default function StatusStrip({ context, liveText }) {
  const { total, openNow } = useStats()

  const live = liveText ?? `${total} Buden · ${openNow} offen`

  return (
    <div className="status-strip">
      <span>{context ?? 'Köln'}</span>
      <span className="status-strip__live">{live}</span>
    </div>
  )
}
