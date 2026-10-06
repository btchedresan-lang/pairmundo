// The 6-slot photo grid used on the profile screen and in first-run setup: add, make main, remove.
import { useState } from 'react';
import { ActivityIndicator, Alert as RNAlert, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Text } from './Text';
import { api } from '../api';
import { tr } from '../i18n';
import { Alert, Photo, T } from './ui';
import { C, useTheme } from '../theme';

const confirm = (title, onYes) => (Platform.OS === 'web' ? (globalThis.confirm?.(title) && onYes())
  : RNAlert.alert(title, undefined, [{ text: tr('Cancel'), style: 'cancel' }, { text: tr('OK'), style: 'destructive', onPress: onYes }]));


export function PhotoGrid({ photos, onChange }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const add = async () => {
    setErr(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      // Shrink and re-encode on the phone so uploads are fast and under the server's 5 MB limit.
      const small = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 1080 } }], { compress: 0.8, format: SaveFormat.JPEG, base64: true });
      const r = await api('/me/photos', { method: 'POST', body: { data_url: `data:image/jpeg;base64,${small.base64}` } });
      onChange(r.photos);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const save = async (list) => { try { onChange((await api('/me/photos', { method: 'PUT', body: { photos: list } })).photos); } catch (e) { setErr(e.message); } };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => {
          const p = photos[i];
          const slot = { width: '31.5%', aspectRatio: 3 / 4, borderRadius: 12, overflow: 'hidden', backgroundColor: t.bg, borderWidth: p ? 0 : 2, borderStyle: 'dashed', borderColor: t.line };
          if (p) {
            return (
              <View key={p} style={slot}>
                <Photo uri={p} style={{ width: '100%', height: '100%' }} />
                {i === 0 ? <Text style={{ position: 'absolute', top: 6, left: 6, backgroundColor: C.primary, color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{tr('Main')}</Text>
                  : <Pressable onPress={() => save([p, ...photos.filter((x) => x !== p)])} style={[dot, { left: 6 }]} accessibilityLabel={tr('Make main photo')}><Text style={{ color: C.gold }}>★</Text></Pressable>}
                <Pressable onPress={() => confirm(tr('Remove this photo?'), () => save(photos.filter((x) => x !== p)))} style={[dot, { right: 6 }]} accessibilityLabel={tr('Remove photo')}><Text style={{ color: C.nope, fontWeight: '800' }}>✕</Text></Pressable>
              </View>
            );
          }
          return (
            <Pressable key={`empty-${i}`} onPress={i === photos.length && !busy ? add : undefined} style={[slot, { alignItems: 'center', justifyContent: 'center' }]}>
              {i === photos.length ? (busy ? <ActivityIndicator color={C.primary} /> : <><Text style={{ fontSize: 28, color: C.primary }}>＋</Text><T small muted>{tr('Add photo')}</T></>) : null}
            </Pressable>
          );
        })}
      </View>
      {err ? <Alert level="error" text={err} /> : null}
    </View>
  );
}
const dot = { position: 'absolute', bottom: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' };
