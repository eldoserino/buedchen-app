import { useState, useEffect } from 'react'
import { useFilter } from '../context/FilterContext'

export function useFilteredBuedchen() {
  const { query, veedel, seating, coffee } = useFilter()
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (query)   params.set('q', query)
    if (seating) params.set('seating', '1')
    if (coffee)  params.set('coffee', '1')
    veedel.forEach(v => params.append('veedel[]', v))

    setLoading(true)
    fetch(`/api/buedchen?${params}`)
      .then(r => r.json())
      .then(rows => { setData(rows); setError(null) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [query, veedel, seating, coffee])

  return { data, loading, error }
}

export function useStats() {
  const [stats, setStats] = useState({ total: 0, openNow: 0 })

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  return stats
}
