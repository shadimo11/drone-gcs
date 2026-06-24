/// <reference types="google.maps" />
import type { Waypoint } from '../state/store.ts';

/**
 * Lazily loads the Google Maps JS API using the key from the environment.
 * Resolves the global `google` namespace. Rejects with a clear message if the
 * key is missing or the script can't load (offline / restricted key).
 */
let loaderPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof google !== 'undefined' && google.maps) return Promise.resolve(google);
  if (loaderPromise) return loaderPromise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key) {
    return Promise.reject(
      new Error('No Google Maps API key set (VITE_GOOGLE_MAPS_API_KEY)'),
    );
  }

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(google);
    script.onerror = () => reject(new Error('Google Maps script failed to load'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

/**
 * Road-snapped routing (SRS D.3). Uses the Directions API to compute a path
 * that follows roads between the clicked anchor points, then simplifies the
 * dense returned polyline down to a manageable, indexed waypoint set
 * (SRS review §1.6) before it is shown in the list or sent to the drone.
 *
 * @param anchors      the points the operator clicked
 * @param sampleMeters minimum spacing between output waypoints
 */
export async function generateRoadSnappedRoute(
  anchors: Waypoint[],
  sampleMeters = 25,
): Promise<Waypoint[]> {
  const g = await loadGoogleMaps();
  if (anchors.length < 2) return anchors;

  const svc = new g.maps.DirectionsService();
  const origin = anchors[0];
  const destination = anchors[anchors.length - 1];
  const middle = anchors.slice(1, -1).map((w) => ({
    location: { lat: w.lat, lng: w.lon },
    stopover: false,
  }));

  const result = await svc.route({
    origin: { lat: origin.lat, lng: origin.lon },
    destination: { lat: destination.lat, lng: destination.lon },
    waypoints: middle,
    travelMode: g.maps.TravelMode.DRIVING,
  });

  const dense: google.maps.LatLng[] = result.routes[0].overview_path;
  const simplified = simplifyByDistance(g, dense, sampleMeters);

  return simplified.map((p, i) => ({ index: i + 1, lat: p.lat(), lon: p.lng() }));
}

/** Keep points that are at least `minMeters` apart along the path. */
function simplifyByDistance(
  g: typeof google,
  pts: google.maps.LatLng[],
  minMeters: number,
): google.maps.LatLng[] {
  if (pts.length === 0) return pts;
  const out = [pts[0]];
  let last = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = g.maps.geometry.spherical.computeDistanceBetween(last, pts[i]);
    if (d >= minMeters) {
      out.push(pts[i]);
      last = pts[i];
    }
  }
  const end = pts[pts.length - 1];
  if (out[out.length - 1] !== end) out.push(end);
  return out;
}
