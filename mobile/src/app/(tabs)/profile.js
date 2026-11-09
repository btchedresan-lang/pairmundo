import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Switch, View } from 'react-native';
import { Text } from '../../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { api, getBase, isCustomServer } from '../../api';
import { useAuth } from '../../auth';
import { AGE_GROUPS, CERTS, cname, fmtDate, HOBBIES, langName, LEVELS, levelName, SKILLS, TOP_LANGS, TRAITS } from '../../data';
import { PhotoGrid } from '../../components/PhotoGrid';
import { tr, trMap } from '../../i18n';
import { Alert, Button, Card, ChoiceChips, Field, Screen, T, useInsets } from '../../components/ui';
import { ChildrenAges, CountryPicker, DateField, StayChips } from '../../components/pickers';
import { profileStrength } from '../../strength';
import { CertProof, useProofs } from '../../components/CertProof';
import { MyReferences } from '../../components/References';
import { brand, C, useTheme } from '../../theme';

const DESTINATIONS = ['US', 'DE', 'FR', 'NL', 'DK', 'SE', 'ES', 'CH', 'BE', 'IE', 'AU', 'CA'];
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };
const labels = (codes, name) => Object.fromEntries(codes.map((k) => [k, name(k)]));

export default function MyProfile() {
  const { me, refresh, signOut, setMe } = useAuth();
  const isAp = me.user.role === 'aupair';
  // Free days of the Family Pass saved for later: the early family bonus, or a gift from the code they signed up with.
  const saved = [me.pass?.early_bonus, me.pass?.gift].find((b) => b && !b.redeemed && !b.expired);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false); // a photo is being moved, so the page must not scroll
  const [proofs, reloadProofs] = useProofs();

  const [f, setF] = useState(() => {
    const p = me.profile || {};
    return {
      name: me.user.name, country: me.user.country, city: me.user.city || '', bio: p.bio || '', visible: p.visible !== 0,
      ...(isAp ? {
        birth_date: p.birth_date || '', nationality: p.nationality, childcare_years: String(p.childcare_years ?? ''), available_from: p.available_from || '',
        duration_months: String(p.duration_months ?? ''), drivers_license: !!p.drivers_license, languages: (p.languages || []).map((l) => l.code),
        levels: Object.fromEntries((p.languages || []).map((l) => [l.code, l.level])), age_groups: p.age_groups || [], skills: p.skills || [], preferred_countries: p.preferred_countries || [],
        traits: p.traits || [], hobbies: p.hobbies || [], goal: p.goal || '', ideal_family: p.ideal_family || '',
        certs: (p.certificates || []).map((c) => c.kind), certDetail: Object.fromEntries((p.certificates || []).map((c) => [c.kind, c.detail || ''])),
      } : {
        children: (p.children || []).map((c) => c.age).join(', '), start_date: p.start_date || '', duration_months: String(p.duration_months ?? ''),
        weekly_hours: String(p.weekly_hours ?? ''), pocket_money: String(p.pocket_money ?? ''), needs_driver: !!p.needs_driver, has_pets: !!p.has_pets,
        languages: p.languages || [], required_languages: p.required_languages || [],
      }),
    };
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  // Unsaved edits: a Save bar stays in view, and they are saved on their own when leaving the tab or the app.
  const t = useTheme();
  const insets = useInsets();
  const [savedAs, setSavedAs] = useState(() => JSON.stringify(f));
  const dirty = JSON.stringify(f) !== savedAs;
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const save = async ({ quiet } = {}) => {
    setBusy(true); setMsg(null);
    const profile = { bio: f.bio, visible: f.visible };
    if (isAp) Object.assign(profile, {
      birth_date: f.birth_date || null, nationality: f.nationality || null, childcare_years: num(f.childcare_years) ?? 0, available_from: f.available_from || null,
      duration_months: num(f.duration_months), drivers_license: f.drivers_license, age_groups: f.age_groups, skills: f.skills, preferred_countries: f.preferred_countries,
      languages: f.languages.map((code) => ({ code, level: f.levels[code] || 'B2' })),
      traits: f.traits, hobbies: f.hobbies, goal: f.goal, ideal_family: f.ideal_family,
      certificates: f.certs.map((kind) => ({ kind, detail: f.certDetail[kind] || null })),
    });
    else Object.assign(profile, {
      children: f.children.split(',').map((s) => s.trim()).filter((s) => s !== '' && !Number.isNaN(Number(s))).map((a) => ({ age: Number(a) })),
      start_date: f.start_date || null, duration_months: num(f.duration_months), weekly_hours: num(f.weekly_hours), pocket_money: num(f.pocket_money),
      needs_driver: f.needs_driver, has_pets: f.has_pets, languages: f.languages, required_languages: f.required_languages,
    });
    try {
      await api('/me', { method: 'PUT', body: { name: f.name, country: f.country, city: f.city, profile } });
      setSavedAs(JSON.stringify(f));
      await refresh(); if (!quiet) setMsg({ level: 'ok', text: tr('Profile saved') });
      return true;
    } catch (e) { setMsg({ level: 'error', text: e.message }); return false; } finally { setBusy(false); }
  };
  const autosave = useRef(null);
  useEffect(() => { autosave.current = () => { if (dirty && !busy) save({ quiet: true }); }; });
  useFocusEffect(useCallback(() => () => autosave.current?.(), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'background') autosave.current?.(); });
    return () => sub.remove();
  }, []);
  const strength = profileStrength(me);
  // Preview saves first, so it shows the profile exactly as it is after any edits.
  const preview = async () => { if (await save({ quiet: true })) router.push(`/user/${me.user.id}`); };

  const toggle = (label, k) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T>{label}</T><Switch value={!!f[k]} onValueChange={set(k)} trackColor={{ true: C.primary }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
    <Screen scrollEnabled={!dragging} style={dirty ? { paddingBottom: 80 } : null}>
      <Button title={`👁 ${tr('Preview my profile')}`} kind="secondary" onPress={preview} disabled={busy} />
      {strength && strength.pct < 100 ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T bold>{tr('Profile strength')}</T><T bold style={{ color: strength.pct >= 80 ? C.ok : C.primary }}>{strength.pct}%</T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}>
            <View style={{ width: `${strength.pct}%`, height: 8, borderRadius: 4, backgroundColor: strength.pct >= 80 ? C.ok : C.primary }} />
          </View>
          <T small muted>{isAp ? tr('Complete profiles get more likes from families.') : tr('Complete profiles get more likes from au pairs.')}</T>
          {strength.tips.slice(0, 3).map((tip) => <T key={tip} small>＋ {tip}</T>)}
        </Card>
      ) : null}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T h2>{tr('Photos')}</T>
        </View>
        <T small muted>{isAp ? tr("Your first photo is what people see when they swipe. Clear, smiling, recent photos work best. Photos with children need their parents' permission.") : tr('Your first photo is what people see when they swipe. Clear, smiling, recent photos work best, and a family photo helps.')}</T>
        <PhotoGrid onDragging={setDragging} photos={me.user.photos || []} onChange={(photos) => setMe((m) => ({ ...m, user: { ...m.user, photos, photo_url: photos[0] || null } }))} />
      </Card>

      <Card>
        <T h2>{tr('Basics')}</T>
        <Field label={tr('Name')} hint={tr('Other members see only your first name and last initial, like Maria L. Your full name is shared once you both confirm a placement.')} value={f.name} onChangeText={set('name')} />
        <CountryPicker label={tr('Country you live in')} value={f.country} onChange={set('country')} />
        <Field label={tr('City')} value={f.city} onChangeText={set('city')} />
        <Field label={isAp ? tr('About me') : tr('About our family')} multiline value={f.bio} onChangeText={set('bio')} />
        {toggle(tr('Show me in Discover'), 'visible')}
      </Card>

      {isAp ? (
        <Card>
          <T h2>{tr('Au pair details')}</T>
          <DateField label={tr('Date of birth')} value={f.birth_date} onChange={set('birth_date')} initial={yearsAgo(21)} maximumDate={yearsAgo(17)} minimumDate={yearsAgo(40)} />
          <CountryPicker label={tr('Nationality')} value={f.nationality} onChange={set('nationality')} />
          <Field label={tr('Years of childcare experience')} value={f.childcare_years} onChangeText={set('childcare_years')} keyboardType="decimal-pad" />
          <DateField label={tr('Available from')} value={f.available_from} onChange={set('available_from')} />
          <StayChips value={f.duration_months} onChange={set('duration_months')} />
          {toggle(tr("I have a driver's license"), 'drivers_license')}
          <ChoiceChips label={tr('Languages I speak')} options={labels(TOP_LANGS, langName)} value={f.languages} onChange={set('languages')} multi />
          {f.languages.map((code) => (
            <ChoiceChips key={code} label={tr('My level in {language}', { language: langName(code) })} options={labels(LEVELS, levelName)}
              value={f.levels[code] || 'B2'} onChange={(lv) => setF((x) => ({ ...x, levels: { ...x.levels, [code]: lv || 'B2' } }))} />
          ))}
          <ChoiceChips label={tr('Experience with')} options={trMap(AGE_GROUPS)} value={f.age_groups} onChange={set('age_groups')} multi />
          <ChoiceChips label={tr('Skills')} options={trMap(SKILLS)} value={f.skills} onChange={set('skills')} multi />
          <ChoiceChips label={tr("Where I'd like to go (empty = anywhere)")} options={labels(DESTINATIONS, cname)} value={f.preferred_countries} onChange={set('preferred_countries')} multi />
          <ChoiceChips label={tr('Words that describe me')} options={trMap(TRAITS)} value={f.traits} onChange={set('traits')} multi />
          <ChoiceChips label={tr('Hobbies')} options={Object.fromEntries(Object.entries(HOBBIES).map(([k, [i, l]]) => [k, `${i} ${tr(l)}`]))} value={f.hobbies} onChange={set('hobbies')} multi />
          <Field label={tr('My goal as an au pair')} multiline value={f.goal} onChangeText={set('goal')} placeholder={tr('For example: improve my English and see more of the world.')} />
          <Field label={tr('My ideal host family')} multiline value={f.ideal_family} onChangeText={set('ideal_family')} placeholder={tr('For example: a warm family with young children who likes the outdoors.')} />
        </Card>
      ) : null}

      {isAp ? (
        <Card>
          <T h2>{tr('Certificates')}</T>
          <T small muted>{tr('Add the certificates you have. Send us a photo of one and we check it, so families see a ✔ next to it. We delete the photo once we have checked it.')}</T>
          <ChoiceChips options={Object.fromEntries(Object.entries(CERTS).map(([k, [i, l]]) => [k, `${i} ${tr(l)}`]))} value={f.certs} onChange={set('certs')} multi />
          {f.certs.filter((k) => CERTS[k]).map((k) => (
            <View key={k}>
              <Field label={tr(CERTS[k][1])} value={f.certDetail[k] || ''} placeholder={tr(CERTS[k][2])}
                onChangeText={(v) => setF((x) => ({ ...x, certDetail: { ...x.certDetail, [k]: v } }))} />
              {/* A photo can only be sent for a certificate that is saved as shown, since changing it clears the check. */}
              <CertProof kind={k} proof={proofs[k]} onSent={reloadProofs}
                saved={(me.profile?.certificates || []).some((c) => c.kind === k && (c.detail || '') === (f.certDetail[k] || ''))} />
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <T h2>{tr('Family details')}</T>
          <ChildrenAges label={tr("Children's ages")} value={f.children} onChange={set('children')} />
          <DateField label={tr('Start date')} value={f.start_date} onChange={set('start_date')} />
          <StayChips value={f.duration_months} onChange={set('duration_months')} />
          <Field label={tr('Hours per week')} value={f.weekly_hours} onChangeText={set('weekly_hours')} keyboardType="number-pad" />
          <Field label={tr('Pocket money per month (local currency)')} value={f.pocket_money} onChangeText={set('pocket_money')} keyboardType="number-pad" />
          {toggle(tr('We need a driver'), 'needs_driver')}
          {toggle(tr('We have pets'), 'has_pets')}
          <ChoiceChips label={tr('Languages at home')} options={labels(TOP_LANGS, langName)} value={f.languages} onChange={set('languages')} multi />
          <ChoiceChips label={tr('Au pair must speak')} options={labels(TOP_LANGS, langName)} value={f.required_languages} onChange={set('required_languages')} multi />
        </Card>
      )}

      {isAp ? <MyReferences /> : null}

      {me.pass?.required || me.pass?.active || saved ? (
        <Pressable onPress={() => router.push('/family-pass')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>🏡</Text>
            <View style={{ flex: 1 }}>
              <T bold>Family Pass</T>
              <T small muted>{me.pass.active ? tr('Active until {date}', { date: fmtDate(me.pass.ends_at) }) : saved ? tr('{days} free days saved for you', { days: saved.days }) : tr('Message au pairs and see who liked you')}</T>
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
      <Button title={tr('Sign out')} kind="ghost" onPress={async () => { if (dirty) await save({ quiet: true }); signOut(); }} />
      {/* The server only matters to testers who switched to another one. */}
      {__DEV__ || isCustomServer() ? <T small muted style={{ textAlign: 'center' }}>{brand.name} · {tr('connected to {server}', { server: getBase() })}</T> : null}
    </Screen>
    {dirty ? (
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 12, backgroundColor: t.card, borderTopWidth: 1, borderColor: t.line,
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 16 + insets.right }}>
        <T small muted style={{ flex: 1 }}>{tr('You have unsaved changes')}</T>
        <Button small title={tr('Save changes')} onPress={() => save()} loading={busy} />
      </View>
    ) : null}
    </View>
  );
}
