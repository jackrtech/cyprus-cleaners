'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const CYPRUS_CENTER: [number, number] = [35.1264, 33.4299]

// A simple CSS teardrop instead of Leaflet's default marker — sidesteps the
// well-known issue where Leaflet's default icon image paths break under
// bundlers (they're referenced as relative paths Leaflet expects to resolve
// against its own CSS file location, which Next's asset pipeline doesn't
// preserve) and matches the brand teal instead of Leaflet's default blue.
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#19706A;transform:rotate(-45deg);border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

interface Props {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// This map only ever mounts inside FullScreenModal, which renders `null`
// until open — so Leaflet's first size measurement can land before the
// modal has actually finished layout/paint, leaving it convinced its
// container is 0×0. Tiles then never get requested and you're left with a
// grey box. Re-measuring on the next frame (and once more shortly after, to
// catch a slower modal-open transition) fixes it.
function InvalidateSizeOnMount() {
  const map = useMap()
  useEffect(() => {
    const raf = requestAnimationFrame(() => map.invalidateSize())
    const timer = setTimeout(() => map.invalidateSize(), 250)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [map])
  return null
}

// Click-or-drag pin picker for a saved address's map location. Rendered only
// client-side (see the dynamic() import in AddressFormModal) since Leaflet
// touches the DOM directly and has no SSR support.
export default function AddressMapPicker({ lat, lng, onChange }: Props) {
  const hasPin = lat != null && lng != null
  const center: [number, number] = hasPin ? [lat, lng] : CYPRUS_CENTER

  return (
    <MapContainer
      center={center}
      zoom={hasPin ? 15 : 8}
      scrollWheelZoom={false}
      style={{ height: 200, width: '100%', borderRadius: 10 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
      <InvalidateSizeOnMount />
      {hasPin && (
        <Marker
          position={[lat, lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: e => {
              const marker = e.target as L.Marker
              const p = marker.getLatLng()
              onChange(p.lat, p.lng)
            },
          }}
        />
      )}
    </MapContainer>
  )
}
