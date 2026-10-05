import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, useTheme } from '../theme';
import { COUNTRIES, flag } from '../data';
import { Photo, T } from './ui';

/** Searchable country picker in a bottom sheet. */
export function CountryPicker({ label, value, onChange, placeholder = 'Choose a country', allowAny }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const items = [...(allowAny ? [['', allowAny]] : []), ...Object.entries(COUNTRIES)]
    .filter(([, n]) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ gap: 4 }}>
      {label ? <T small bold>{label}</T> : null}
      <Pressable onPress={() => setOpen(true)} style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, backgroundColor: t.bg }}>
        <Text style={{ color: value ? t.ink : t.muted, fontSize: 15 }}>{value ? `${flag(value)} ${COUNTRIES[value] || value}` : allowAny || placeholder}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: insets.bottom + 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
              <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={t.muted} autoFocus
                style={{ flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 10, color: t.ink }} />
              <Pressable onPress={() => setOpen(false)}><Text style={{ color: C.primary, fontWeight: '700' }}>Close</Text></Pressable>
            </View>
            <FlatList data={items} keyExtractor={([k]) => k || 'any'} keyboardShouldPersistTaps="handled"
              renderItem={({ item: [k, n] }) => (
                <Pressable onPress={() => { onChange(k || null); setOpen(false); setQ(''); }}
                  style={{ paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: 1, borderColor: t.line, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: t.ink, fontSize: 16 }}>{k ? `${flag(k)}  ${n}` : n}</Text>
                  {k === (value || '') ? <Text style={{ color: C.primary }}>✓</Text> : null}
                </Pressable>
              )} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** The "It's a match!" celebration. */
export function MatchModal({ match, me, onMessage, onClose }) {
  return (
    <Modal visible={!!match} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,20,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 44, fontWeight: '900', fontStyle: 'italic', color: C.primary }}>{"It's a match!"}</Text>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>You and {match?.other?.name} liked each other.</Text>
        <View style={{ flexDirection: 'row', marginVertical: 16 }}>
          <Photo user={me} rounded style={{ width: 128, height: 128, borderWidth: 4, borderColor: '#fff', transform: [{ rotate: '-8deg' }, { translateX: 12 }] }} />
          <Photo user={match?.other} rounded style={{ width: 128, height: 128, borderWidth: 4, borderColor: '#fff', transform: [{ rotate: '8deg' }, { translateX: -12 }] }} />
        </View>
        <Pressable onPress={onMessage} style={{ backgroundColor: C.primary, borderRadius: 999, paddingVertical: 14, width: '100%', maxWidth: 340, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>💬  Send a message</Text>
        </Pressable>
        <Pressable onPress={onClose} style={{ borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderRadius: 999, paddingVertical: 14, width: '100%', maxWidth: 340, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Keep swiping</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
