import { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Text, TextInput } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, useTheme } from '../theme';
import { COUNTRIES, country, flag, fmtDate } from '../data';
import { getLang, tr } from '../i18n';
import { Chip, Chips, ChoiceChips, Field, Photo, T } from './ui';

/** Searchable country picker in a bottom sheet. */
export function CountryPicker({ label, value, onChange, placeholder = tr('Choose a country'), allowAny }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sorted = Object.keys(COUNTRIES).map((k) => [k, country(k)]).sort((a, b) => a[1].localeCompare(b[1]));
  const items = [...(allowAny ? [['', allowAny]] : []), ...sorted].filter(([, n]) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ gap: 4 }}>
      {label ? <T small bold>{label}</T> : null}
      <Pressable onPress={() => setOpen(true)} style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, backgroundColor: t.bg }}>
        <Text style={{ color: value ? t.ink : t.muted, fontSize: 15 }}>{value ? `${flag(value)} ${country(value)}` : allowAny || placeholder}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: insets.bottom + 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
              <TextInput value={q} onChangeText={setQ} placeholder={tr('Search')} placeholderTextColor={t.muted} autoFocus
                style={{ flex: 1, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 10, color: t.ink }} />
              <Pressable onPress={() => setOpen(false)}><Text style={{ color: C.primary, fontWeight: '700' }}>{tr('Close')}</Text></Pressable>
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
        <Text style={{ fontSize: 44, fontWeight: '900', fontStyle: 'italic', color: C.primary }}>{tr("It's a match!")}</Text>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>{tr('You and {name} liked each other.', { name: match?.other?.name })}</Text>
        <View style={{ flexDirection: 'row', marginVertical: 16 }}>
          <Photo user={me} rounded style={{ width: 128, height: 128, borderWidth: 4, borderColor: '#fff', transform: [{ rotate: '-8deg' }, { translateX: 12 }] }} />
          <Photo user={match?.other} rounded style={{ width: 128, height: 128, borderWidth: 4, borderColor: '#fff', transform: [{ rotate: '8deg' }, { translateX: -12 }] }} />
        </View>
        <Pressable onPress={onMessage} style={{ backgroundColor: C.primary, borderRadius: 999, paddingVertical: 14, width: '100%', maxWidth: 340, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>💬  {tr('Send a message')}</Text>
        </Pressable>
        <Pressable onPress={onClose} style={{ borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderRadius: 999, paddingVertical: 14, width: '100%', maxWidth: 340, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{tr('Keep swiping')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };

/**
 * A date as YYYY-MM-DD, picked from the phone's own date picker instead of typed.
 * `initial` is where the picker opens when nothing is chosen yet (say, 20 years ago for a birth date).
 */
export function DateField({ label, hint, value, onChange, minimumDate, maximumDate, initial, placeholder = tr('Choose a date') }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const current = fromIso(value);
  const start = current || initial || new Date();
  // The web preview has no native picker: type the date there.
  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 4 }}>
        {label ? <T small bold>{label}</T> : null}
        <TextInput value={value || ''} onChangeText={(v) => onChange(v)} placeholder="YYYY-MM-DD" placeholderTextColor={t.muted}
          style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, color: t.ink, backgroundColor: t.bg }} />
        {hint ? <T small muted>{hint}</T> : null}
      </View>
    );
  }
  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: start, mode: 'date', minimumDate, maximumDate, onChange: (e, d) => { if (e.type === 'set' && d) onChange(isoDate(d)); } });
    } else { setDraft(start); setOpen(true); }
  };
  return (
    <View style={{ gap: 4 }}>
      {label ? <T small bold>{label}</T> : null}
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={label}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, backgroundColor: t.bg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: current ? t.ink : t.muted, fontSize: 15 }}>{current ? fmtDate(value) : placeholder}</Text>
        <Text style={{ fontSize: 16 }}>📅</Text>
      </Pressable>
      {hint ? <T small muted>{hint}</T> : null}
      {Platform.OS === 'ios' ? (
        <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 14 }}>
                <Pressable onPress={() => setOpen(false)} hitSlop={8}><Text style={{ color: t.muted, fontWeight: '600', fontSize: 16 }}>{tr('Cancel')}</Text></Pressable>
                {label ? <T bold>{label.replace(/\s*\(YYYY-MM-DD\)$/, '')}</T> : null}
                <Pressable onPress={() => { onChange(isoDate(draft || start)); setOpen(false); }} hitSlop={8}><Text style={{ color: C.primary, fontWeight: '700', fontSize: 16 }}>{tr('Done')}</Text></Pressable>
              </View>
              {draft ? <DateTimePicker value={draft} mode="date" display="spinner" minimumDate={minimumDate} maximumDate={maximumDate} locale={getLang()}
                onChange={(e, d) => d && setDraft(d)} style={{ alignSelf: 'stretch' }} /> : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** Children's ages as tappable chips, written as "2, 6" like the rest of the form expects. */
export function ChildrenAges({ label, value, onChange }) {
  const [adding, setAdding] = useState(false);
  const ages = String(value || '').split(',').map((s) => s.trim()).filter((s) => s !== '' && !Number.isNaN(Number(s))).map(Number);
  const write = (list) => onChange(list.join(', '));
  const name = (a) => (a === 0 ? tr('Baby') : tr('{n} yrs', { n: a }));
  return (
    <View style={{ gap: 6 }}>
      {label ? <T small bold>{label}</T> : null}
      <Chips>
        {ages.map((a, i) => <Chip key={`${i}-${a}`} label={`${name(a)}  ✕`} on onPress={() => write(ages.filter((_, j) => j !== i))} />)}
        <Chip label={`＋ ${tr('Add a child')}`} onPress={() => setAdding(!adding)} />
      </Chips>
      {adding ? (
        <>
          <T small muted>{tr('How old is the child?')}</T>
          <Chips>
            {Array.from({ length: 18 }, (_, a) => <Chip key={a} label={a === 0 ? tr('Baby') : String(a)} onPress={() => { write([...ages, a].sort((x, y) => x - y)); setAdding(false); }} />)}
          </Chips>
        </>
      ) : null}
    </View>
  );
}

const STAYS = [6, 9, 12, 18, 24];
/** Stay length in months: the usual au pair stays as one tap, or Other to type a number. */
export function StayChips({ value, onChange }) {
  const v = String(value ?? '');
  const usual = STAYS.map(String).includes(v);
  const [other, setOther] = useState(!!v && !usual);
  const [typing, setTyping] = useState(false); // focus the box only when they tap Other, not when the form opens
  const options = { ...Object.fromEntries(STAYS.map((n) => [String(n), tr('{n} months', { n })])), other: tr('Other') };
  return (
    <View style={{ gap: 6 }}>
      <ChoiceChips label={tr('Stay length')} options={options} value={other ? 'other' : usual ? v : null}
        onChange={(k) => { if (k === 'other') { setOther(true); setTyping(true); onChange(''); } else { setOther(false); onChange(k || ''); } }} />
      {other ? <Field label={tr('Stay length (months)')} value={v} onChangeText={onChange} keyboardType="number-pad" autoFocus={typing} /> : null}
    </View>
  );
}
