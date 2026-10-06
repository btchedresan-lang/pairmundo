// First-run setup: three short steps (photos, basics, about) right after sign-up, so new profiles aren't empty.
// Each step saves as you go. "Skip for now" remembers the choice on this phone; the Profile tab has everything too.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { AGE_GROUPS, langName, SKILLS, TOP_LANGS } from '../data';
import { tr, trMap } from '../i18n';
import { store } from '../storage';
import { Alert, Button, ChoiceChips, Field, Screen, T } from '../components/ui';
import { CountryPicker } from '../components/pickers';
import { PhotoGrid } from '../components/PhotoGrid';
import { C, useTheme } from '../theme';

const STEPS = 3;
const labels = (codes, name) => Object.fromEntries(codes.map((k) => [k, name(k)]));
const num = (v) => (v === '' || v == null ? null : Number(v));

/** True when a signed-in member has no photo or no description yet. */
export const needsSetup = (me) => !!me && me.user.role !== 'admin' && (!(me.user.photos || []).length || !me.profile?.bio);
/** Where "skip" or "done" is remembered on this device (SecureStore keys allow letters, digits, - and _). */
export const setupKey = (id) => `setup-done-${id}`;

export default function Setup() {
  const { me, refresh, setMe } = useAuth();
  const t = useTheme();
  const isAp = me.user.role === 'aupair';
  const p = me.profile || {};
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [f, setF] = useState(() => (isAp ? {
    birth_date: p.birth_date || '', nationality: p.nationality || null, available_from: p.available_from || '',
    duration_months: String(p.duration_months ?? ''), languages: (p.languages || []).map((l) => l.code),
    age_groups: p.age_groups || [], skills: p.skills || [], bio: p.bio || '',
  } : {
    children: (p.children || []).map((c) => c.age).join(', '), start_date: p.start_date || '', duration_months: String(p.duration_months ?? ''),
    languages: p.languages || [], bio: p.bio || '',
  }));
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const photos = me.user.photos || [];

  const finish = async () => {
    await store.set(setupKey(me.user.id), '1');
    router.replace('/discover');
  };
  const saveAndNext = async (profile) => {
    setErr(null); setBusy(true);
    try {
      await api('/me', { method: 'PUT', body: { profile } });
      await refresh();
      if (step + 1 < STEPS) setStep(step + 1); else await finish();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const basics = () => (isAp ? {
    birth_date: f.birth_date.trim() || null, nationality: f.nationality, available_from: f.available_from.trim() || null,
    duration_months: num(f.duration_months), languages: f.languages.map((code) => ({ code, level: (p.languages || []).find((l) => l.code === code)?.level || 'B2' })),
  } : {
    children: f.children.split(',').map((s) => s.trim()).filter((s) => s !== '' && !Number.isNaN(Number(s))).map((a) => ({ age: Number(a) })),
    start_date: f.start_date.trim() || null, duration_months: num(f.duration_months), languages: f.languages,
  });
  const about = () => (isAp ? { bio: f.bio, age_groups: f.age_groups, skills: f.skills } : { bio: f.bio });

  const titles = [tr('Add your photos'), tr('The basics'), isAp ? tr('About you') : tr('About your family')];
  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        {Array.from({ length: STEPS }, (_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.primary : t.line }} />)}
      </View>
      <T small muted>{tr('Step {n} of {total}', { n: step + 1, total: STEPS })}</T>
      <T h1>{titles[step]}</T>

      {step === 0 ? <>
        <T muted>{isAp ? tr('Families decide in seconds. A clear, smiling, recent photo of your face works best.') : tr('Au pairs want to see who they would live with. A friendly family photo works best.')}</T>
        <PhotoGrid photos={photos} onChange={(list) => setMe((m) => ({ ...m, user: { ...m.user, photos: list, photo_url: list[0] || null } }))} />
        <Button title={tr('Next')} onPress={() => setStep(1)} disabled={!photos.length} />
      </> : null}

      {step === 1 ? (isAp ? <>
        <Field label={tr('Date of birth (YYYY-MM-DD)')} value={f.birth_date} onChangeText={set('birth_date')} placeholder="2003-04-12" />
        <CountryPicker label={tr('Nationality')} value={f.nationality} onChange={set('nationality')} />
        <ChoiceChips label={tr('Languages I speak')} options={labels(TOP_LANGS, langName)} value={f.languages} onChange={set('languages')} multi />
        <Field label={tr('Available from (YYYY-MM-DD)')} value={f.available_from} onChangeText={set('available_from')} />
        <Field label={tr('Stay length (months)')} value={f.duration_months} onChangeText={set('duration_months')} keyboardType="number-pad" />
        <Button title={tr('Next')} onPress={() => saveAndNext(basics())} loading={busy} />
      </> : <>
        <Field label={tr("Children's ages (comma separated)")} value={f.children} onChangeText={set('children')} placeholder="2, 6" />
        <Field label={tr('Start date (YYYY-MM-DD)')} value={f.start_date} onChangeText={set('start_date')} />
        <Field label={tr('Stay length (months)')} value={f.duration_months} onChangeText={set('duration_months')} keyboardType="number-pad" />
        <ChoiceChips label={tr('Languages at home')} options={labels(TOP_LANGS, langName)} value={f.languages} onChange={set('languages')} multi />
        <Button title={tr('Next')} onPress={() => saveAndNext(basics())} loading={busy} />
      </>) : null}

      {step === 2 ? <>
        <T muted>{isAp ? tr('A few sentences: who you are, your experience with children, and why you want to be an au pair.') : tr('A few sentences: who is in your family, what a normal week looks like, and what you hope for in an au pair.')}</T>
        <Field label={isAp ? tr('About me') : tr('About our family')} multiline value={f.bio} onChangeText={set('bio')} />
        {isAp ? <>
          <ChoiceChips label={tr('Experience with')} options={trMap(AGE_GROUPS)} value={f.age_groups} onChange={set('age_groups')} multi />
          <ChoiceChips label={tr('Skills')} options={trMap(SKILLS)} value={f.skills} onChange={set('skills')} multi />
        </> : null}
        <Button title={tr('Finish')} onPress={() => saveAndNext(about())} loading={busy} disabled={!f.bio.trim()} />
      </> : null}

      {err ? <Alert level="error" text={err} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {step > 0 ? <Button small kind="ghost" title={`← ${tr('Back')}`} onPress={() => setStep(step - 1)} /> : <View />}
        <Button small kind="ghost" title={tr('Skip for now')} onPress={finish} />
      </View>
    </Screen>
  );
}
