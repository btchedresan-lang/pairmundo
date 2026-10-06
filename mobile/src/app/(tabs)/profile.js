import { useState } from 'react';
import { ActivityIndicator, Alert as RNAlert, Platform, Pressable, Switch, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api, getBase } from '../../api';
import { useAuth } from '../../auth';
import { AGE_GROUPS, cname, langName, SKILLS } from '../../data';
import { tr, trMap } from '../../i18n';
import { Alert, Button, Card, ChoiceChips, Field, Photo, Screen, T } from '../../components/ui';
import { CountryPicker } from '../../components/pickers';
import { brand, C, useTheme } from '../../theme';

const TOP_LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'pl', 'zh', 'vi', 'tl', 'af'];
const DESTINATIONS = ['US', 'DE', 'FR', 'NL', 'DK', 'SE', 'ES', 'CH', 'BE', 'IE', 'AU'];
const labels = (codes, name) => Object.fromEntries(codes.map((k) => [k, name(k)]));
const confirm = (title, onYes) => (Platform.OS === 'web' ? (globalThis.confirm?.(title) && onYes())
  : RNAlert.alert(title, undefined, [{ text: tr('Cancel'), style: 'cancel' }, { text: tr('OK'), style: 'destructive', onPress: onYes }]));

function PhotoGrid({ photos, onChange }) {
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

export default function MyProfile() {
  const { me, refresh, signOut, setMe } = useAuth();
  const isAp = me.user.role === 'aupair';
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState(() => {
    const p = me.profile || {};
    return {
      name: me.user.name, country: me.user.country, city: me.user.city || '', bio: p.bio || '', visible: p.visible !== 0,
      ...(isAp ? {
        birth_date: p.birth_date || '', nationality: p.nationality, childcare_years: String(p.childcare_years ?? ''), available_from: p.available_from || '',
        duration_months: String(p.duration_months ?? ''), drivers_license: !!p.drivers_license, languages: (p.languages || []).map((l) => l.code),
        levels: Object.fromEntries((p.languages || []).map((l) => [l.code, l.level])), age_groups: p.age_groups || [], skills: p.skills || [], preferred_countries: p.preferred_countries || [],
      } : {
        children: (p.children || []).map((c) => c.age).join(', '), start_date: p.start_date || '', duration_months: String(p.duration_months ?? ''),
        weekly_hours: String(p.weekly_hours ?? ''), pocket_money: String(p.pocket_money ?? ''), needs_driver: !!p.needs_driver, has_pets: !!p.has_pets,
        languages: p.languages || [], required_languages: p.required_languages || [],
      }),
    };
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const save = async () => {
    setBusy(true); setMsg(null);
    const profile = { bio: f.bio, visible: f.visible };
    if (isAp) Object.assign(profile, {
      birth_date: f.birth_date || null, nationality: f.nationality || null, childcare_years: num(f.childcare_years) ?? 0, available_from: f.available_from || null,
      duration_months: num(f.duration_months), drivers_license: f.drivers_license, age_groups: f.age_groups, skills: f.skills, preferred_countries: f.preferred_countries,
      languages: f.languages.map((code) => ({ code, level: f.levels[code] || 'B2' })),
    });
    else Object.assign(profile, {
      children: f.children.split(',').map((s) => s.trim()).filter((s) => s !== '' && !Number.isNaN(Number(s))).map((a) => ({ age: Number(a) })),
      start_date: f.start_date || null, duration_months: num(f.duration_months), weekly_hours: num(f.weekly_hours), pocket_money: num(f.pocket_money),
      needs_driver: f.needs_driver, has_pets: f.has_pets, languages: f.languages, required_languages: f.required_languages,
    });
    try {
      await api('/me', { method: 'PUT', body: { name: f.name, country: f.country, city: f.city, profile } });
      await refresh(); setMsg({ level: 'ok', text: tr('Profile saved') });
    } catch (e) { setMsg({ level: 'error', text: e.message }); } finally { setBusy(false); }
  };

  const toggle = (label, k) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T>{label}</T><Switch value={!!f[k]} onValueChange={set(k)} trackColor={{ true: C.primary }} />
    </View>
  );

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T h2>{tr('Photos')}</T>
          <Pressable onPress={() => router.push(`/user/${me.user.id}`)}><T small style={{ color: C.primary }}>{tr('Preview my card')} →</T></Pressable>
        </View>
        <T small muted>{isAp ? tr('Your first photo is what people see when they swipe. Clear, smiling, recent photos work best.') : tr('Your first photo is what people see when they swipe. Clear, smiling, recent photos work best, and a family photo helps.')}</T>
        <PhotoGrid photos={me.user.photos || []} onChange={(photos) => setMe((m) => ({ ...m, user: { ...m.user, photos, photo_url: photos[0] || null } }))} />
      </Card>

      <Card>
        <T h2>{tr('Basics')}</T>
        <Field label={tr('Name')} value={f.name} onChangeText={set('name')} />
        <CountryPicker label={tr('Country you live in')} value={f.country} onChange={set('country')} />
        <Field label={tr('City')} value={f.city} onChangeText={set('city')} />
        <Field label={isAp ? tr('About me') : tr('About our family')} multiline value={f.bio} onChangeText={set('bio')} />
        {toggle(tr('Show me in Discover'), 'visible')}
      </Card>

      {isAp ? (
        <Card>
          <T h2>{tr('Au pair details')}</T>
          <Field label={tr('Date of birth (YYYY-MM-DD)')} value={f.birth_date} onChangeText={set('birth_date')} placeholder="2003-04-12" />
          <CountryPicker label={tr('Nationality')} value={f.nationality} onChange={set('nationality')} />
          <Field label={tr('Years of childcare experience')} value={f.childcare_years} onChangeText={set('childcare_years')} keyboardType="decimal-pad" />
          <Field label={tr('Available from (YYYY-MM-DD)')} value={f.available_from} onChangeText={set('available_from')} />
          <Field label={tr('Stay length (months)')} value={f.duration_months} onChangeText={set('duration_months')} keyboardType="number-pad" />
          {toggle(tr("I have a driver's license"), 'drivers_license')}
          <ChoiceChips label={tr('Languages I speak')} options={labels(TOP_LANGS, langName)} value={f.languages} onChange={set('languages')} multi />
          <ChoiceChips label={tr('Experience with')} options={trMap(AGE_GROUPS)} value={f.age_groups} onChange={set('age_groups')} multi />
          <ChoiceChips label={tr('Skills')} options={trMap(SKILLS)} value={f.skills} onChange={set('skills')} multi />
          <ChoiceChips label={tr("Where I'd like to go (empty = anywhere)")} options={labels(DESTINATIONS, cname)} value={f.preferred_countries} onChange={set('preferred_countries')} multi />
        </Card>
      ) : (
        <Card>
          <T h2>{tr('Family details')}</T>
          <Field label={tr("Children's ages (comma separated)")} value={f.children} onChangeText={set('children')} placeholder="2, 6" />
          <Field label={tr('Start date (YYYY-MM-DD)')} value={f.start_date} onChangeText={set('start_date')} />
          <Field label={tr('Stay length (months)')} value={f.duration_months} onChangeText={set('duration_months')} keyboardType="number-pad" />
          <Field label={tr('Hours per week')} value={f.weekly_hours} onChangeText={set('weekly_hours')} keyboardType="number-pad" />
          <Field label={tr('Pocket money per month (local currency)')} value={f.pocket_money} onChangeText={set('pocket_money')} keyboardType="number-pad" />
          {toggle(tr('We need a driver'), 'needs_driver')}
          {toggle(tr('We have pets'), 'has_pets')}
          <ChoiceChips label={tr('Languages at home')} options={labels(TOP_LANGS, langName)} value={f.languages} onChange={set('languages')} multi />
          <ChoiceChips label={tr('Au pair must speak')} options={labels(TOP_LANGS, langName)} value={f.required_languages} onChange={set('required_languages')} multi />
        </Card>
      )}

      {msg ? <Alert level={msg.level} text={msg.text} /> : null}
      <Button title={tr('Save profile')} onPress={save} loading={busy} />
      <Button title={`🛂 ${tr('Country au pair rules')}`} kind="ghost" onPress={() => router.push('/programs')} />
      <Button title={`🔒 ${tr('Account and safety')}`} kind="ghost" onPress={() => router.push('/account')} />
      <Button title={tr('Sign out')} kind="ghost" onPress={signOut} />
      <T small muted style={{ textAlign: 'center' }}>{brand.name} · {tr('connected to {server}', { server: getBase() })}</T>
    </Screen>
  );
}
