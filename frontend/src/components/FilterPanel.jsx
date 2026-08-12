import { useFilter } from '../context/FilterContext'
import '../styles/components/bottom-sheet.css'
import '../styles/components/chip.css'

const VEEDEL_LIST = [
  'Altstadt-Nord', 'Altstadt-Süd', 'Bayenthal', 'Belgisches Viertel',
  'Bickendorf', 'Bilderstöckchen', 'Braunsfeld', 'Deutz',
  'Ehrenfeld', 'Holweide', 'Kalk', 'Lindenthal',
  'Longerich', 'Mülheim', 'Neustadt-Nord', 'Neustadt-Süd',
  'Nippes', 'Ossendorf', 'Porz', 'Rondorf',
  'Sülz', 'Südstadt', 'Vingst',
]

export default function FilterPanel() {
  const {
    veedel, toggleVeedel,
    seating, setSeating,
    coffee, setCoffee,
    setFilterOpen, resetFilters, activeCount,
  } = useFilter()

  return (
    <>
      <div className="sheet-overlay" onClick={() => setFilterOpen(false)} />
      <div className="filter-sheet">
        <div className="filter-sheet__header">
          <h2 className="filter-sheet__title">Filter</h2>
          {activeCount > 0 && (
            <button className="filter-sheet__reset" onClick={resetFilters}>
              Zurücksetzen
            </button>
          )}
        </div>

        <div className="filter-section">
          <div className="filter-section__label">Veedel</div>
          <div className="filter-veedel-grid">
            {VEEDEL_LIST.map(v => (
              <button
                key={v}
                className={`chip${veedel.includes(v) ? ' active-tinte' : ''}`}
                onClick={() => toggleVeedel(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-section__label">Ausstattung</div>
          <div className="filter-toggle">
            <span className="filter-toggle__label">Außensitzplätze</span>
            <button
              className={`filter-toggle__btn${seating ? ' on' : ''}`}
              onClick={() => setSeating(!seating)}
              aria-pressed={seating}
            />
          </div>
          <div className="filter-toggle">
            <span className="filter-toggle__label">Kaffee</span>
            <button
              className={`filter-toggle__btn${coffee ? ' on' : ''}`}
              onClick={() => setCoffee(!coffee)}
              aria-pressed={coffee}
            />
          </div>
        </div>
      </div>
    </>
  )
}
