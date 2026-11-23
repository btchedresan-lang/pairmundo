// The Nearby map: meetups as pins and people as counts per area, never a pin per person (see server/nearby.js).
// Drawn with Leaflet and OpenStreetMap tiles inside a web view, so it needs no map API key and works the same on
// iPhone, Android and the web preview. brand.json's mapTiles / mapAttribution can point it at another tile provider.
import { useEffect, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { brand, C } from '../theme';
import { MEETUP_KINDS } from './Meetups';

const TILES = brand.mapTiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = brand.mapAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** The page inside the web view. Data goes in as JSON; taps on a meetup come back as { type: 'meetup', id }. */
function mapHtml({ meetups, areas, center, labels }) {
  const data = JSON.stringify({ meetups: meetups.map((m) => ({ id: m.id, title: m.title, lat: m.point.lat, lng: m.point.lng, exact: m.point.exact,
    emoji: (MEETUP_KINDS[m.kind] || MEETUP_KINDS.other)[0], official: !!m.official, external: !!m.external })), areas, center, labels, primary: C.primary })
    .replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif}
.pin{width:42px;height:42px;border-radius:21px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(0,0,0,.25);border:3px solid var(--c)}
.pin.approx{border-style:dashed}
.bubble{flex-direction:column;border-radius:50%;background:rgba(59,91,219,.18);border:2px solid rgba(59,91,219,.6);display:flex;align-items:center;justify-content:center;color:#1e2a5a;font-weight:700;font-size:13px;text-align:center;line-height:1.1}
.leaflet-tooltip{font-weight:600}</style></head><body><div id="map"></div><script>
const D = ${data};
const send = (m) => { const s = JSON.stringify(m); if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else parent.postMessage(s, '*'); };
const map = L.map('map', { zoomControl: false, attributionControl: true });
L.tileLayer(${JSON.stringify(TILES)}, { maxZoom: 17, attribution: ${JSON.stringify(ATTRIBUTION)} }).addTo(map);
const pts = [];
for (const a of D.areas) {
  const size = Math.min(84, 44 + a.count * 3);
  L.marker([a.lat, a.lng], { interactive: false, icon: L.divIcon({ className: '', iconSize: [size, size], html: '<div class="bubble" style="width:' + size + 'px;height:' + size + 'px"><span>' + a.count + '</span><span style="font-weight:500;font-size:10px">' + D.labels.people + '</span></div>' }) }).addTo(map);
  pts.push([a.lat, a.lng]);
}
for (const m of D.meetups) {
  const color = m.official ? '#2f9e44' : m.external ? '#3b5bdb' : D.primary;
  L.marker([m.lat, m.lng], { icon: L.divIcon({ className: '', iconSize: [42, 42], html: '<div class="pin' + (m.exact ? '' : ' approx') + '" style="--c:' + color + '">' + m.emoji + '</div>' }) })
    .bindTooltip(m.title, { direction: 'top', offset: [0, -20] }).on('click', () => send({ type: 'meetup', id: m.id })).addTo(map);
  pts.push([m.lat, m.lng]);
}
if (D.center) pts.push([D.center.lat, D.center.lng]);
if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
else if (pts.length) map.setView(pts[0], 12);
else map.setView([30, 10], 2);
</script></body></html>`;
}

export function NearbyMap({ meetups, areas, center, labels, onMeetup, style }) {
  const html = useMemo(() => mapHtml({ meetups, areas, center, labels }), [meetups, areas, center, labels]);
  const onMeetupRef = useRef(onMeetup);
  useEffect(() => { onMeetupRef.current = onMeetup; }, [onMeetup]);
  const handle = (raw) => {
    try { const m = JSON.parse(raw); if (m?.type === 'meetup') onMeetupRef.current?.(m.id); } catch { /* not ours */ }
  };
  // The web preview has no native web view: an iframe does the same job there.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const listener = (e) => handle(e.data);
    globalThis.addEventListener?.('message', listener);
    return () => globalThis.removeEventListener?.('message', listener);
  }, []);
  if (Platform.OS === 'web') {
    return <View style={[{ overflow: 'hidden', borderRadius: 20 }, style]}><iframe title="map" srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} /></View>;
  }
  return (
    <View style={[{ overflow: 'hidden', borderRadius: 20 }, style]}>
      <WebView originWhitelist={['*']} source={{ html, baseUrl: 'https://pairmundo.com' }} onMessage={(e) => handle(e.nativeEvent.data)}
        style={{ flex: 1 }} scrollEnabled={false} setSupportMultipleWindows={false} />
    </View>
  );
}
