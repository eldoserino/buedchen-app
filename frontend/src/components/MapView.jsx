import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import '../styles/components/map.css'

const KOELN = [50.938, 6.960]

function createPinIcon(isEditorial = false) {
  const bgColor = isEditorial ? 'var(--tinte)' : 'var(--rot)'
  const fgColor = isEditorial ? 'var(--on-tinte)' : 'var(--on-rot)'
  const html = `
    <div class="pin-icon${isEditorial ? ' pin-icon--editorial' : ''}">
      <div class="pin-icon__body" style="background:${bgColor};color:${fgColor}">
        <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
          <path d="M128,16a96,96,0,1,0,96,96A96.11,96.11,0,0,0,128,16Zm0,176a80,80,0,1,1,80-80A80.09,80.09,0,0,1,128,192Zm-8-80V80a8,8,0,0,1,16,0v32h32a8,8,0,0,1,0,16H128A8,8,0,0,1,120,112Z"/>
        </svg>
      </div>
      <div class="pin-icon__tip"></div>
    </div>`
  return L.divIcon({ className: '', html, iconSize: [34, 42], iconAnchor: [17, 42] })
}

function createClusterIcon(cluster) {
  const count = cluster.getChildCount()
  const html  = `<div class="cluster-icon">${count}</div>`
  return L.divIcon({ className: '', html, iconSize: [40, 34], iconAnchor: [20, 17] })
}

function ClusterLayer({ buedchen, onSelect }) {
  const map         = useMap()
  const groupRef    = useRef(null)

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }

    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: createClusterIcon,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 60,
    })

    buedchen.forEach(b => {
      const isEditorial = b.editorial_badges?.length > 0
      const marker = L.marker([b.lat, b.lng], {
        icon: createPinIcon(isEditorial),
      })
      marker.on('click', () => onSelect(b))
      group.addLayer(marker)
    })

    map.addLayer(group)
    groupRef.current = group

    return () => { map.removeLayer(group) }
  }, [map, buedchen, onSelect])

  return null
}

export default function MapView({ buedchen, onSelect }) {
  return (
    <div className="map-wrapper">
      <MapContainer
        center={KOELN}
        zoom={13}
        className="map-container"
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ClusterLayer buedchen={buedchen} onSelect={onSelect} />
      </MapContainer>
    </div>
  )
}
