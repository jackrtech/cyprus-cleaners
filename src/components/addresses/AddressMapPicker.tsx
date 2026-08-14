'use client'

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
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
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
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
