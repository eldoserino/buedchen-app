import StatusStrip from '../components/StatusStrip'
import FloatSearch from '../components/FloatSearch'
import BuedchenSegment from '../components/BuedchenSegment'
import FactSegment from '../components/FactSegment'
import { useFilteredBuedchen } from '../hooks/useFilteredBuedchen'
import '../styles/components/chip.css'

export default function ListPage() {
  const { data, loading } = useFilteredBuedchen()

  const count = data.length
  const liveText = loading ? '…' : `${count} Treffer`

  // Segmente aufbauen: nach Index 3 (0-based) das Fact-Segment einfügen
  const segments = []
  let factInserted = false

  for (let i = 0; i < data.length; i++) {
    segments.push(
      <BuedchenSegment key={data[i].id} buedchen={data[i]} index={i} />
    )
    if (i === 2 && !factInserted) {
      segments.push(<FactSegment key="fact" />)
      factInserted = true
    }
  }

  return (
    <>
      <StatusStrip liveText={liveText} />
      <FloatSearch />
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingTop: 62,
        paddingBottom: 'var(--s-6)',
        scrollbarWidth: 'none',
      }}>
        {loading && (
          <div style={{
            padding: 'var(--s-6) var(--seg-x)',
            fontSize: '.75rem',
            color: 'var(--on-creme-dim)',
            letterSpacing: '.08em',
          }}>
            Lade Büdchen …
          </div>
        )}
        {segments}
      </div>
    </>
  )
}
