import { createContext, useContext, useState, useCallback } from 'react'

const FilterContext = createContext(null)

export function FilterProvider({ children }) {
  const [query, setQuery]           = useState('')
  const [veedel, setVeedel]         = useState([]) // string[]
  const [seating, setSeating]       = useState(false)
  const [coffee, setCoffee]         = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const resetFilters = useCallback(() => {
    setQuery('')
    setVeedel([])
    setSeating(false)
    setCoffee(false)
  }, [])

  const toggleVeedel = useCallback((v) => {
    setVeedel(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    )
  }, [])

  const activeCount =
    (query ? 1 : 0) +
    veedel.length +
    (seating ? 1 : 0) +
    (coffee ? 1 : 0)

  return (
    <FilterContext.Provider value={{
      query, setQuery,
      veedel, toggleVeedel,
      seating, setSeating,
      coffee, setCoffee,
      filterOpen, setFilterOpen,
      resetFilters,
      activeCount,
    }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilter() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilter must be used within FilterProvider')
  return ctx
}
