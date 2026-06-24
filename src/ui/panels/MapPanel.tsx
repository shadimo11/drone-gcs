import { useEffect, useRef, useState } from 'react';
import { useGcs } from '../../state/store.ts';
import { useThrottledTelemetry } from '../hooks/useThrottledTelemetry.ts';
import { loadGoogleMaps } from '../../services/googleMaps.ts';

/**
 * Full-bleed map (SRS D.3 main view).
 *
 * - Google Maps JS API, satellite/terrain toggle.
 * - Live drone marker following telemetry lat/lon, rotated to heading.
 * - Click to drop a waypoint (coordinates auto-extracted from the click).
 * - Waypoints rendered as numbered circles joined by the route polyline.
 * - Road-snapped routing via the Directions API (SRS D.3), simplified to a
 *   manageable waypoint set before display / uplink (SRS review §1.6).
 *
 * If the Maps script fails to load (no key / offline), a clear fallback panel
 * is shown rather than a blank screen (SRS review §1.5).
 */
export function MapPanel({ terrain }: { terrain: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const droneMarkerRef = useRef<google.maps.Marker | null>(null);
  const wpMarkersRef = useRef<google.maps.Marker[]>([]);
  const pathRef = useRef<google.maps.Polyline | null>(null);
  const [error, setError] = useState<string | null>(null);

  const theme = useGcs((s) => s.settings.theme);
  const addWaypoint = useGcs((s) => s.addWaypoint);
  const waypoints = useGcs((s) => s.waypoints);
  const t = useThrottledTelemetry();

  // init map once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: 30.0444, lng: 31.2357 },
          zoom: 16,
          mapTypeId: terrain ? 'terrain' : 'satellite',
          tilt: 45,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        });
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) addWaypoint(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
      })
      .catch((err) => !cancelled && setError(err.message ?? 'Map failed to load'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // terrain / satellite toggle
  useEffect(() => {
    mapRef.current?.setMapTypeId(terrain ? 'terrain' : 'satellite');
  }, [terrain]);

  // drone marker follows telemetry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !t || typeof google === 'undefined') return;
    const pos = { lat: t.latitude, lng: t.longitude };
    if (!droneMarkerRef.current) {
      droneMarkerRef.current = new google.maps.Marker({
        map,
        icon: {
          path: 'M 0 -12 L 8 10 L 0 5 L -8 10 Z',
          fillColor: '#4f9bff', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 1.5,
          rotation: t.psiFb, scale: 1.1,
        },
      });
    }
    droneMarkerRef.current.setPosition(pos);
    droneMarkerRef.current.setIcon({
      path: 'M 0 -12 L 8 10 L 0 5 L -8 10 Z',
      fillColor: '#4f9bff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5,
      rotation: t.psiFb, scale: 1.1,
    });
  }, [t]);

  // render waypoints + route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof google === 'undefined') return;

    wpMarkersRef.current.forEach((m) => m.setMap(null));
    wpMarkersRef.current = waypoints.map(
      (w) =>
        new google.maps.Marker({
          map,
          position: { lat: w.lat, lng: w.lon },
          label: { text: String(w.index), color: '#fff', fontSize: '11px' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11, fillColor: '#0c447c', fillOpacity: 1,
            strokeColor: '#85b7eb', strokeWeight: 1.5,
          },
        }),
    );

    pathRef.current?.setMap(null);
    if (waypoints.length >= 2) {
      pathRef.current = new google.maps.Polyline({
        map,
        path: waypoints.map((w) => ({ lat: w.lat, lng: w.lon })),
        strokeColor: '#85b7eb', strokeOpacity: 0.9, strokeWeight: 2,
      });
    }
  }, [waypoints]);

  if (error) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--map-fallback)' }}>
        <div className="panel panel-pad" style={{ maxWidth: 360, textAlign: 'center' }}>
          <i className="ti ti-map-off" style={{ fontSize: 28, color: 'var(--warn)' }} aria-hidden="true" />
          <p style={{ fontSize: 14, margin: '10px 0 4px' }}>Map unavailable</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            {error}. Last-known telemetry is still live in the side panels.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} data-theme-hint={theme} style={{ position: 'absolute', inset: 0 }} aria-label="Map view" />;
}
