import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { fmtDate } from '../../data';
import { tr } from '../../i18n';
import { Alert, Button, Card, Field, Loading, Screen, T } from '../../components/ui';
import { useTheme } from '../../theme';

// The server writes the agreement as [English sentence, values] pairs; each is translated here.
const clause = ([text, vars]) => tr(text, Object.fromEntries(Object.entries(vars || {}).map(([k, v]) => [k, ['start', 'end'].includes(k) ? fmtDate(v) : v])));
const num = (v) => (v == null ? '' : String(v));

export default function Agreement() {
  const { id } = useLocalSearchParams();
  const { me } = useAuth();
  const t = useTheme();
  const [a, setA] = useState(null);
  const [terms, setTerms] = useState(null);
  const [name, setName] = useState(me.user.name);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const show = (r) => { setA(r); setTerms({ ...r.terms, days_off: num(r.terms.days_off), paid_leave_weeks: num(r.terms.paid_leave_weeks), notice_weeks: num(r.terms.notice_weeks) }); };
  useFocusEffect(useCallback(() => { api(`/placements/${id}/agreement`).then(show).catch((e) => setError(e.message)); }, [id]));
  const act = async (fn) => { setBusy(true); setError(null); try { show(await fn()); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  if (!a) return error ? <Screen><Alert level="error" text={error} /></Screen> : <Loading />;
  const set = (k) => (v) => setTerms((x) => ({ ...x, [k]: v }));
  const canSign = a.editable && a.my_side && !a.signatures[a.my_side];
  const sig = (side, label) => (
    <View style={{ flex: 1, borderTopWidth: 1, borderColor: t.line, paddingTop: 8 }}>
      <T small muted>{label}</T>
      {a.signatures[side] ? <><T style={{ fontSize: 20, fontStyle: 'italic' }}>{a.signatures[side].name}</T><T small muted>{tr('Signed {date}', { date: fmtDate(a.signatures[side].at) })}</T></>
        : <T muted>{tr('Not signed yet')}</T>}
    </View>
  );
  return (
    <Screen>
      {error ? <Alert level="error" text={error} /> : null}
      <Card>
        <T h2>{tr('Au pair agreement')}</T>
        {a.sections.map((s) => (
          <View key={s.title[0]} style={{ gap: 4, marginTop: 6 }}>
            <T bold>{clause(s.title)}</T>
            {s.text ? <T>{s.text}</T> : s.clauses.map((x) => <T key={x[0]}>• {clause(x)}</T>)}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>{sig('family', tr('Host family'))}{sig('aupair', tr('Au pair'))}</View>
      </Card>
      {canSign ? (
        <Card>
          <T bold>{tr('Sign the agreement')}</T>
          {a.missing.length ? <Alert level="warning" text={tr('Fill in the days off, paid holiday and notice period before signing.')} /> : null}
          <T small muted>{tr('Type your full name. Signing means you agree to everything in this agreement.')}</T>
          <Field value={name} onChangeText={setName} />
          <Button title={tr('Sign')} disabled={!!a.missing.length} loading={busy} onPress={() => act(() => api(`/placements/${id}/agreement/sign`, { method: 'POST', body: { name } }))} />
        </Card>
      ) : null}
      {a.editable ? (
        <Card>
          <T bold>{tr('Change the terms')}</T>
          <T small muted>{tr('Saving new terms clears both signatures, so you both sign the new version.')}</T>
          <Field label={tr('Days off each week')} value={terms.days_off} onChangeText={set('days_off')} keyboardType="decimal-pad" />
          <Field label={tr('Weeks of paid holiday a year')} value={terms.paid_leave_weeks} onChangeText={set('paid_leave_weeks')} keyboardType="decimal-pad" />
          <Field label={tr('Notice period (weeks)')} value={terms.notice_weeks} onChangeText={set('notice_weeks')} keyboardType="number-pad" />
          <Field label={tr('Help with the language course')} value={terms.language_support} onChangeText={set('language_support')} placeholder={tr('For example: EUR 70 a month toward the course')} />
          <Field label={tr('Daily duties')} multiline value={terms.duties} onChangeText={set('duties')} placeholder={tr('For example: school runs, playtime after school, tidying the children’s rooms.')} />
          <Field label={tr('House rules')} multiline value={terms.house_rules} onChangeText={set('house_rules')} placeholder={tr('For example: guests, curfew, using the car.')} />
          <Button kind="secondary" title={tr('Save terms')} loading={busy} onPress={() => act(() => api(`/placements/${id}/agreement`, { method: 'PUT', body: { terms } }))} />
        </Card>
      ) : null}
    </Screen>
  );
}
