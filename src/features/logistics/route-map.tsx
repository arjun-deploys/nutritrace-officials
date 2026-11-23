import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';

export default function RouteMap({ route, last }: { route: { lat: number; lng: number }[]; last?: { lat: number; lng: number } }) {
  const points = route.length ? route : last ? [last] : [];
  if (!points.length) return null;
  const center = points[points.length - 1]!;
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={9} scrollWheelZoom={false} className="h-64 w-full rounded-md border" attributionControl>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      {route.length > 1 && <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#1f6b4f', weight: 3 }} />}
      <CircleMarker center={[center.lat, center.lng]} radius={8} pathOptions={{ color: '#d99a1e', fillColor: '#d99a1e', fillOpacity: 0.9 }}>
        <Tooltip>Last known position</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
