import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { api, getBase } from '../../api';
import { useAuth } from '../../auth';
import { AGE_GROUPS, cname, fmtDate, langName, SKILLS, TOP_LANGS } from '../../data';
import { PhotoGrid } from '../../components/PhotoGrid';
import { tr, trMap } from '../../i18n';
import { Alert, Button, Card, ChoiceChips, Field, Screen, T } from '../../components/ui';
import { CountryPicker } from '../../components/pickers';
import { brand, C } from '../../theme';

const DESTINATIONS = ['US', 'DE', 'FR', 'NL', 'DK', 'SE', 'ES', 'CH', 'BE', 'IE', 'AU'];
const labels = (codes, name) => Object.fromEntries(codes.map((k) => [k, name(k)]));

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

  const save = async ({ quiet } = {}) => {
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
      await refresh(); if (!quiet) setMsg({ level: 'ok', text: tr('Profile saved') });
      return true;
    } catch (e) { setMsg({ level: 'error', text: e.message }); return false; } finally { setBusy(false); }
  };
  // Preview saves first, so it shows the profile exactly as it is after any edits.
  const preview = async () => { if (await save({ quiet: true })) router.push(`/user/${me.user.id}`); };

  const toggle = (label, k) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T>{label}</T><Switch value={!!f[k]} onValueChange={set(k)} trackColor={{ true: C.primary }} />
    </View>
  );

  return (
    <Screen>
      <Button title={`👁 ${tr('Preview my profile')}`} kind="secondary" onPress={preview} disabled={busy} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T h2>{tr('Photos')}</T>
        </View>
        <T small muted>{isAp ? tr("Your first photo is what people see when they swipe. Clear, smiling, recent photos work best. Photos with children need their parents' permission.") : tr('Your first photo is what people see when they swipe. Clear, smiling, recent photos work best, and a family photo helps.')}</T>
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

      {me.pass?.required || me.pass?.active ? (
        <Pressable onPress={() => router.push('/family-pass')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>🏡</Text>
            <View style={{ flex: 1 }}>
              <T bold>Family Pass</T>
              <T small muted>{me.pass.active ? tr('Active until {date}', { date: fmtDate(me.pass.ends_at) }) : tr('Message au pairs and see who liked you')}</T>
            </View>
            <T style={{ color: C.primary }}>→</T>
          </Card>
        </Pressable>
      ) : null}

      {msg ? <Alert level={msg.level} text={msg.text} /> : null}
      <Button title={tr('Save profile')} onPress={() => save()} loading={busy} />
      <Button title={`🛂 ${tr('Country au pair rules')}`} kind="ghost" onPress={() => router.push('/programs')} />
      {!me.user.verification?.id ? <Button title={`🪪 ${tr('Verify my ID')}`} kind="secondary" onPress={() => router.push('/account')} /> : null}
      <Button title={`🔒 ${tr('Account and safety')}`} kind="ghost" onPress={() => router.push('/account')} />
      <Button title={tr('Sign out')} kind="ghost" onPress={signOut} />
      <T small muted style={{ textAlign: 'center' }}>{brand.name} · {tr('connected to {server}', { server: getBase() })}</T>
    </Screen>
  );
}
