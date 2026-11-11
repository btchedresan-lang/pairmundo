import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HEADING, Text, TextInput } from './Text';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, lift, useTheme } from '../theme';
import { imageUrl } from '../api';
import { initials } from '../data';
import { tr } from '../i18n';

export function Screen({ children, scroll = true, scrollEnabled = true, padded = true, style }) {
  const t = useTheme();
  const body = <View style={[padded && { padding: 16 }, { gap: 12 }, style]}>{children}</View>;
  return scroll
    ? <ScrollView scrollEnabled={scrollEnabled} style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{body}</ScrollView>
    : <View style={[{ flex: 1, backgroundColor: t.bg }, padded && { padding: 16 }, style]}>{children}</View>;
}

export function T({ style, muted, small, bold, h1, h2, children, ...rest }) {
  const t = useTheme();
  return (
    <Text style={[{ color: muted ? t.muted : t.ink, fontSize: h1 ? 30 : h2 ? 22 : small ? 13 : 15, ...(h1 || h2 ? { fontFamily: HEADING, letterSpacing: -0.3 } : { fontWeight: bold ? '700' : '400', lineHeight: small ? 18 : 21 }) }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Card({ children, style }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 18, gap: 10 }, lift.sm, style]}>{children}</View>;
}

/**
 * Buttons. primary: the brand gradient with a soft shadow; secondary: a quiet tinted button; ghost: text only;
 * danger: red. `icon` is an Ionicons name shown before the title. Every press gives a small scale-down.
 */
export function Button({ title, onPress, kind = 'primary', small, disabled, loading, style, icon }) {
  const t = useTheme();
  const filled = kind === 'primary' || kind === 'danger';
  const fg = filled ? '#fff' : kind === 'secondary' ? C.primary : t.ink;
  const bg = kind === 'secondary' ? t.tint : kind === 'danger' ? C.nope : 'transparent';
  const pad = { paddingVertical: small ? 9 : 15, paddingHorizontal: small ? 14 : 22 };
  const body = loading ? <ActivityIndicator color={fg} /> : (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: kind === 'ghost' ? '600' : '700', fontSize: small ? 14 : 16, letterSpacing: 0.1 }}>{title}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [{ borderRadius: 999, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        kind === 'primary' && !disabled && lift.md, kind === 'primary' && { shadowColor: C.primary }, style]}>
      {kind === 'primary' ? (
        <LinearGradient colors={[C.primary2, C.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: 999, alignItems: 'center' }, pad]}>{body}</LinearGradient>
      ) : <View style={[{ borderRadius: 999, alignItems: 'center', backgroundColor: bg }, pad]}>{body}</View>}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, tone, style }) {
  const t = useTheme();
  const colors = tone === 'ok' ? ['#e8f7ee', C.ok] : tone === 'warn' ? ['#fff3e0', C.warn] : tone === 'err' ? ['#ffeef0', C.err]
    : on ? [C.primary, '#fff'] : [t.card, t.ink];
  const body = <View style={[{ backgroundColor: colors[0], paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: onPress && !on ? 1 : 0, borderColor: t.line }, style]}>
    <Text style={{ color: colors[1], fontSize: 13.5, fontWeight: '600' }}>{label}</Text></View>;
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>{body}</Pressable> : body;
}

export const Chips = ({ children }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;

export function Field({ label, hint, value, onChangeText, multiline, keyboardType, placeholder, secureTextEntry, autoCapitalize, textContentType, autoComplete,
  maxLength, autoFocus, returnKeyType, onSubmitEditing, style }) {
  const t = useTheme();
  // Passwords get a Show/Hide switch, so people can check what they typed.
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <T small bold>{label}</T> : null}
      <View>
        <TextInput value={value == null ? '' : String(value)} onChangeText={onChangeText} multiline={multiline} keyboardType={keyboardType}
          placeholder={placeholder} placeholderTextColor={t.muted} secureTextEntry={secureTextEntry && hidden} autoCapitalize={autoCapitalize ?? (secureTextEntry ? 'none' : undefined)}
          autoCorrect={secureTextEntry || keyboardType === 'email-address' ? false : undefined}
          textContentType={textContentType} autoComplete={autoComplete} maxLength={maxLength} autoFocus={autoFocus} returnKeyType={returnKeyType} onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ borderWidth: 1.5, borderColor: focused ? C.primary : t.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, paddingRight: secureTextEntry ? 64 : 14,
            fontSize: 16, color: t.ink, backgroundColor: t.card, minHeight: multiline ? 104 : undefined, textAlignVertical: multiline ? 'top' : 'center' }} />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden(!hidden)} hitSlop={8} accessibilityRole="button" accessibilityLabel={hidden ? tr('Show password') : tr('Hide password')}
            style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>{hidden ? tr('Show') : tr('Hide')}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <T small muted>{hint}</T> : null}
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
  if (value == null) return <T small muted>{tr('No reviews yet')}</T>;
  const n = Math.round(value);
  return <Text style={{ color: C.gold, fontSize: size }}>{'★'.repeat(n)}{'☆'.repeat(5 - n)} <Text style={{ fontWeight: '700' }}>{value}</Text></Text>;
}

export function StarInput({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityLabel={tr('{n} stars', { n })}>
          <Text style={{ fontSize: 28, color: n <= (value || 0) ? C.gold : '#d0d5dd' }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The round action buttons under the swipe deck. `icon` is an Ionicons name; `filled` gives the gradient Like button. */
export function RoundButton({ icon, color, size = 'lg', onPress, disabled, label, filled }) {
  const t = useTheme();
  const d = size === 'lg' ? 66 : 50;
  const inner = <Ionicons name={icon} size={size === 'lg' ? 32 : 22} color={filled ? '#fff' : color} />;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ width: d, height: d, borderRadius: d / 2, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
        lift.md, filled && { shadowColor: color, shadowOpacity: 0.35 }]}>
      {filled ? (
        <LinearGradient colors={[C.like2, color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center' }}>{inner}</LinearGradient>
      ) : <View style={{ flex: 1, borderRadius: d / 2, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>{inner}</View>}
    </Pressable>
  );
}

export function Alert({ level = 'info', text }) {
  const map = { error: ['#ffeef0', C.err, 'alert-circle'], warning: ['#fff4e2', C.warn, 'warning'], info: ['#eef1fc', '#3b5bdb', 'information-circle'], ok: ['#e8f7ee', C.ok, 'checkmark-circle'] };
  const [bg, fg, icon] = map[level] || map.info;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <Text style={{ color: fg, fontSize: 14, flex: 1, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export function ComplianceBox({ compliance }) {
  if (!compliance) return null;
  return (
    <View style={{ gap: 6 }}>
      {compliance.issues.map((i, k) => <Alert key={k} level={i.level} text={tr(i.text)} />)}
      {compliance.ok ? <Alert level="ok" text={tr('Meets the program rules on file.')} /> : null}
    </View>
  );
}

/** An empty state. `icon` is an Ionicons name (shown in a soft circle) or, for older callers, an emoji. */
export function Empty({ icon = 'earth', title, text, children }) {
  const t = useTheme();
  const vector = /^[a-z-]+$/.test(icon);
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingVertical: 36, gap: 10 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        {vector ? <Ionicons name={icon} size={40} color={C.primary} /> : <Text style={{ fontSize: 40 }}>{icon}</Text>}
      </View>
      {title ? <T h2 style={{ textAlign: 'center' }}>{title}</T> : null}
      {text ? <T muted style={{ textAlign: 'center', lineHeight: 22 }}>{text}</T> : null}
      {children ? <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator color={C.primary} size="large" /></View>;
}

export const useInsets = useSafeAreaInsets;
