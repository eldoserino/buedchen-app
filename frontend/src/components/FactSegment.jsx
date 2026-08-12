import BuedchenDoodle from '../illustrations/BuedchenDoodle'
import '../styles/components/buedchen-segment.css'

const FACTS = [
  'Köln hat mehr Büdchen als jede andere deutsche Stadt.',
  'Das erste Büdchen in Köln öffnete 1887 in der Südstadt.',
  'Rund 1.000 Büdchen machen Köln zur Kiosk-Hauptstadt.',
]

export default function FactSegment({ index = 0 }) {
  const fact = FACTS[index % FACTS.length]
  return (
    <div className="seg seg--fact">
      <div>
        <div className="seg__top" style={{ marginBottom: 'var(--s-3)' }}>
          <span>Wusstest du</span>
        </div>
        <p className="seg__fact-text">{fact}</p>
      </div>
      <BuedchenDoodle />
    </div>
  )
}
