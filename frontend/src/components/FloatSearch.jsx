import { MagnifyingGlass, FunnelSimple } from '@phosphor-icons/react'
import { useFilter } from '../context/FilterContext'
import '../styles/components/float-search.css'

export default function FloatSearch() {
  const { query, setQuery, setFilterOpen, activeCount } = useFilter()

  return (
    <div className="float-search">
      <span className="float-search__icon">
        <MagnifyingGlass weight="fill" size={17} />
      </span>
      <input
        className="float-search__input"
        type="search"
        placeholder="Büdchen suchen"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Büdchen suchen"
      />
      <button
        className="float-search__filter-btn"
        onClick={() => setFilterOpen(true)}
        aria-label="Filter öffnen"
      >
        <FunnelSimple weight="fill" size={17} />
        {activeCount > 0 && (
          <span className="float-search__badge">{activeCount}</span>
        )}
      </button>
    </div>
  )
}
