import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, useTheme } from '../theme';
import { imageUrl } from '../api';
import { initials } from '../data';

export function Screen({ children, scroll = true, padded = true, style }) {
  const t = useTheme();
  const body = <View style={[padded && { padding: 16 }, { gap: 12 }, style]}>{children}</View>;
  return scroll
    ? <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{body}</ScrollView>
    : <View style={[{ flex: 1, backgroundColor: t.bg }, padded && { padding: 16 }, style]}>{children}</View>;
}

export function T({ style, muted, small, bold, h1, h2, children, ...rest }) {
  const t = useTheme();
  return (
    <Text style={[{ color: muted ? t.muted : t.ink, fontSize: h1 ? 26 : h2 ? 19 : small ? 13 : 15, fontWeight: h1 || h2 || bold ? '700' : '400' }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Card({ children, style }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, gap: 8 }, style]}>{children}</View>;
}

export function Button({ title, onPress, kind = 'primary', small, disabled, loading, style }) {
  const t = useTheme();
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? C.nope : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'secondary' ? C.primary : t.ink;
  const border = kind === 'secondary' ? C.primary : kind === 'ghost' ? t.line : bg;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: 999, paddingVertical: small ? 8 : 13,
        paddingHorizontal: small ? 14 : 20, alignItems: 'center', opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, tone, style }) {
  const t = useTheme();
  const colors = tone === 'ok' ? ['#ebfbee', C.ok] : tone === 'warn' ? ['#fff4e6', C.warn] : tone === 'err' ? ['#fff5f5', C.err]
    : on ? [C.primary, '#fff'] : [t.soft, t.ink];
  const body = <View style={[{ backgroundColor: colors[0], paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: onPress && !on ? 1 : 0, borderColor: t.line }, style]}>
    <Text style={{ color: colors[1], fontSize: 13, fontWeight: '600' }}>{label}</Text></View>;
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export const Chips = ({ children }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;

export function Field({ label, value, onChangeText, multiline, keyboardType, placeholder, secureTextEntry, autoCapitalize }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label ? <T small bold>{label}</T> : null}
      <TextInput value={value == null ? '' : String(value)} onChangeText={onChangeText} multiline={multiline} keyboardType={keyboardType}
        placeholder={placeholder} placeholderTextColor={t.muted} secureTextEntry={secureTextEntry} autoCapitalize={autoCapitalize}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, color: t.ink, backgroundColor: t.bg, minHeight: multiline ? 96 : undefined, textAlignVertical: multiline ? 'top' : 'center' }} />
    </View>
  );
}

/** A labelled single-choice picker made of chips (keeps us free of native picker modules). */
export function ChoiceChips({ label, options, value, onChange, multi }) {
  const sel = multi ? value || [] : value;
  return (
    <View style={{ gap: 6 }}>
      {label ? <T small bold>{label}</T> : null}
      <Chips>{Object.entries(options).map(([k, v]) => {
        const on = multi ? sel.includes(k) : sel === k;
        return <Chip key={k} label={v} on={on} onPress={() => onChange(multi ? (on ? sel.filter((x) => x !== k) : [...sel, k]) : on ? null : k)} />;
      })}</Chips>
    </View>
  );
}

export function Photo({ user, uri, style, rounded }) {
  const src = imageUrl(uri ?? user?.photos?.[0] ?? user?.photo_url);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <View style={[style, { backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }, rounded && { borderRadius: 999 }]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 28 }}>{initials(user?.name)}</Text></View>;
  }
  return <Image source={{ uri: src }} style={[style, rounded && { borderRadius: 999 }]} contentFit="cover" transition={150} onError={() => setFailed(true)} />;
}

export function Stars({ value, size = 15 }) {
  if (value == null) return <T small muted>No reviews yet</T>;
  const n = Math.round(value);
  return <Text style={{ color: C.gold, fontSize: size }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)} <Text style={{ fontWeight: '700' }}>{value}</Text></Text>;
}

export function StarInput({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityLabel={`${n} stars`}>
          <Text style={{ fontSize: 28, color: n <= (value || 0) ? C.gold : '#d0d5dd' }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function RoundButton({ icon, color, size = 'lg', onPress, disabled, label }) {
  const t = useTheme();
  const d = size === 'lg' ? 64 : 48;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label}
      style={({ pressed }) => ({ width: d, height: d, borderRadius: d / 2, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
        opacity: disabled ? 0.35 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Text style={{ fontSize: size === 'lg' ? 28 : 20, color, fontWeight: '800' }}>{icon}</Text>
    </Pressable>
  );
}

export function Alert({ level = 'info', text }) {
  const map = { error: ['#fff5f5', C.err, '✖'], warning: ['#fff4e6', C.warn, '⚠'], info: ['#eef2ff', '#3b5bdb', 'ℹ'], ok: ['#ebfbee', C.ok, '✓'] };
  const [bg, fg, icon] = map[level] || map.info;
  return <View style={{ backgroundColor: bg, borderRadius: 10, padding: 10 }}><Text style={{ color: fg, fontSize: 14 }}>{icon} {text}</Text></View>;
}

export function ComplianceBox({ compliance }) {
  if (!compliance) return null;
  return (
    <View style={{ gap: 6 }}>
      {compliance.issues.map((i, k) => <Alert key={k} level={i.level} text={i.text} />)}
      {compliance.ok ? <Alert level="ok" text="Meets the program rules on file." /> : null}
    </View>
  );
}

export function Empty({ icon = '🌍', title, text, children }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Text style={{ fontSize: 44 }}>{icon}</Text>
      {title ? <T h2 style={{ textAlign: 'center' }}>{title}</T> : null}
      {text ? <T muted style={{ textAlign: 'center' }}>{text}</T> : null}
      {children}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator color={C.primary} size="large" /></View>;
}

export const useInsets = useSafeAreaInsets;
