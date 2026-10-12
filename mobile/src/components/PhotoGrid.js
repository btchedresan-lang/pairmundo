// The 6-slot photo grid used on the profile screen and in first-run setup: add, make main, remove, and hold-and-drag to reorder.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert as RNAlert, PanResponder, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Text } from './Text';
import { api } from '../api';
import { tr } from '../i18n';
import { Alert, Photo, T } from './ui';
import { C, useTheme } from '../theme';

// Resolves true when the member taps Yes.
const ask = (title) => (Platform.OS === 'web' ? Promise.resolve(!!globalThis.confirm?.(title))
  : new Promise((done) => RNAlert.alert(title, undefined, [{ text: tr('Cancel'), style: 'cancel', onPress: () => done(false) }, { text: tr('Yes'), onPress: () => done(true) }], { cancelable: true, onDismiss: () => done(false) })));

const confirm = (title, onYes) => (Platform.OS === 'web' ? (globalThis.confirm?.(title) && onYes())
  : RNAlert.alert(title, undefined, [{ text: tr('Cancel'), style: 'cancel' }, { text: tr('OK'), style: 'destructive', onPress: onYes }]));


const GAP = 8;
const HOLD_MS = 250;
const move = (list, from, to) => { const next = list.filter((_, i) => i !== from); next.splice(to, 0, list[from]); return next; };

// One photo. Holding it for a moment picks it up; then it follows the finger until it is let go.
// Taps on its buttons still go to the buttons, and a quick swipe still scrolls the screen.
function Tile({ index, enabled, style, onLift, onDrag, onDrop, children }) {
  const [latest] = useState({});
  useEffect(() => { Object.assign(latest, { index, enabled, onLift, onDrag, onDrop }); });
  const [pan] = useState(() => {
    let timer = null;
    let lifted = false;
    const stop = (drop) => { clearTimeout(timer); timer = null; if (lifted) latest.onDrop(drop); lifted = false; };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => latest.enabled,
      onPanResponderGrant: () => {
        timer = setTimeout(() => { lifted = true; latest.onLift(latest.index); }, HOLD_MS);
        return false; // let the screen scroll if this turns out to be a swipe
      },
      onPanResponderMove: (_, g) => {
        if (lifted) latest.onDrag(g.dx, g.dy);
        else if (Math.abs(g.dx) + Math.abs(g.dy) > 10) { clearTimeout(timer); timer = null; }
      },
      onPanResponderTerminationRequest: () => !lifted,
      onPanResponderRelease: () => stop(true),
      onPanResponderTerminate: () => stop(false),
    });
  });
  return <View style={style} {...pan.panHandlers}>{children}</View>;
}

export function PhotoGrid({ photos, onChange, onDragging }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [width, setWidth] = useState(0);
  // While a photo is held: which slot it came from, which slot it would land in, and how far it has moved.
  const [drag, setDragState] = useState(null);
  const dragNow = useRef(null); // the same, readable the moment the finger lifts
  const setDrag = (d) => { dragNow.current = d; setDragState(d); };
  const add = async () => {
    setErr(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      // Shrink and re-encode on the phone so uploads are fast and under the server's 5 MB limit.
      const small = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 1080 } }], { compress: 0.8, format: SaveFormat.JPEG, base64: true });
      const body = { data_url: `data:image/jpeg;base64,${small.base64}` };
      const r = await api('/me/photos', { method: 'POST', body }).catch(async (e) => {
        // The photo shows children: post it only once the member confirms they have permission.
        if (e.data?.code !== 'child_permission' || !(await ask(tr("This photo shows children. Are you their parent or guardian, or do you have their parents' permission to post it?")))) throw e;
        return api('/me/photos', { method: 'POST', body: { ...body, child_permission: true } });
      });
      onChange(r.photos);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const save = async (list) => { try { onChange((await api('/me/photos', { method: 'PUT', body: { photos: list } })).photos); } catch (e) { setErr(e.message); } };

  const w = width * 0.315;
  const h = (w * 4) / 3;
  const at = (i) => ({ x: (i % 3) * (w + GAP), y: Math.floor(i / 3) * (h + GAP) });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const slotAt = (x, y) => Math.min(photos.length - 1, clamp(Math.round(y / (h + GAP)), 0, 1) * 3 + clamp(Math.round(x / (w + GAP)), 0, 2));
  const order = drag ? move(photos, drag.from, drag.to) : photos;

  const lift = (from) => { setErr(null); setDrag({ from, to: from, dx: 0, dy: 0 }); onDragging?.(true); };
  const dragTo = (dx, dy) => { const d = dragNow.current; if (d) setDrag({ ...d, dx, dy, to: slotAt(at(d.from).x + dx, at(d.from).y + dy) }); };
  const drop = (keep) => {
    const d = dragNow.current;
    setDrag(null);
    onDragging?.(false);
    if (!keep || !d || d.to === d.from) return;
    const next = move(photos, d.from, d.to);
    onChange(next); // show the new order straight away
    api('/me/photos', { method: 'PUT', body: { photos: next } }).then((r) => onChange(r.photos)).catch((e) => { onChange(photos); setErr(e.message); });
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {Array.from({ length: 6 }, (_, i) => {
          const p = photos[i];
          const slot = { width: '31.5%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden', backgroundColor: t.bg, borderWidth: p ? 0 : 2, borderStyle: 'dashed', borderColor: t.line };
          if (p) {
            // Tiles stay in their place in the list and slide to where they would end up, so the held one is never re-mounted.
            const lifting = drag?.from === i;
            const shown = order.indexOf(p);
            const shift = lifting ? { x: drag.dx, y: drag.dy } : { x: at(shown).x - at(i).x, y: at(shown).y - at(i).y };
            const lifted = lifting ? { zIndex: 10, elevation: 8, opacity: 0.9, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } } : null;
            return (
              <Tile key={p} index={i} enabled={photos.length > 1} onLift={lift} onDrag={dragTo} onDrop={drop}
                style={[slot, lifted, Platform.OS === 'web' && { userSelect: 'none', cursor: drag ? 'grabbing' : 'grab' }, { transform: [{ translateX: shift.x }, { translateY: shift.y }, { scale: lifting ? 1.06 : 1 }] }]}>
                <View pointerEvents="none" style={{ width: '100%', height: '100%' }}><Photo uri={p} style={{ width: '100%', height: '100%' }} /></View>
                {lifting ? null : shown === 0 ? <Text style={{ position: 'absolute', top: 6, left: 6, backgroundColor: C.primary, color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{tr('Main')}</Text>
                  : <Pressable onPress={() => save([p, ...photos.filter((x) => x !== p)])} style={[dot, { left: 6 }]} accessibilityLabel={tr('Make main photo')}><Text style={{ color: C.gold }}>★</Text></Pressable>}
                {lifting ? null : <Pressable onPress={() => confirm(tr('Remove this photo?'), () => save(photos.filter((x) => x !== p)))} style={[dot, { right: 6 }]} accessibilityLabel={tr('Remove photo')}><Text style={{ color: C.nope, fontWeight: '800' }}>✕</Text></Pressable>}
              </Tile>
            );
          }
          return (
            <Pressable key={`empty-${i}`} onPress={i === photos.length && !busy ? add : undefined} style={[slot, { alignItems: 'center', justifyContent: 'center' }]}>
              {i === photos.length ? (busy ? <ActivityIndicator color={C.primary} /> : <><Text style={{ fontSize: 28, color: C.primary }}>＋</Text><T small muted>{tr('Add photo')}</T></>) : null}
            </Pressable>
          );
        })}
      </View>
      {photos.length > 1 ? <T small muted>{tr('Hold a photo and drag it to change the order.')}</T> : null}
      {err ? <Alert level="error" text={err} /> : null}
    </View>
  );
}
const dot = { position: 'absolute', bottom: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' };
