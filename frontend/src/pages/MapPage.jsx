import { useState } from 'react'
import StatusStrip from '../components/StatusStrip'
import FloatSearch from '../components/FloatSearch'
import MapView from '../components/MapView'
import MarkerPopup from '../components/MarkerPopup'
import { useFilteredBuedchen } from '../hooks/useFilteredBuedchen'

export default function MapPage() {
  const { data } = useFilteredBuedchen()
  const [selected, setSelected] = useState(null)

  return (
    <>
      <StatusStrip />
      <FloatSearch />
      <MapView
        buedchen={data}
        onSelect={b => setSelected(b)}
      />
      {selected && (
        <MarkerPopup
          buedchen={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
