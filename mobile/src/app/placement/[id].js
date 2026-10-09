import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { cname, country, CRIT_LABEL, fmtDate, statusLabel, statusTone } from '../../data';
import { tr } from '../../i18n';
import { Alert, Button, Card, Chip, ComplianceBox, Field, Loading, Screen, StarInput, Stars, T } from '../../components/ui';
import { C, useTheme } from '../../theme';

const NEXT = { confirmed: ['active'], active: ['completed'] };

export default function Placement() {
  const { id } = useLocalSearchParams();
  const { me } = useAuth();
  const t = useTheme();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [review, setReview] = useState({ overall: 0, criteria: {}, comment: '' });
  const load = useCallback(() => api(`/placements/${id}`).then(setP).catch((e) => setError(e.message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const act = async (fn) => { try { setError(null); const r = await fn(); if (r?.id) setP(r); else await load(); } catch (e) { setError(e.message); } };

  if (!p) return error ? <Screen><Alert level="error" text={error} /></Screen> : <Loading />;
  const isAp = me.user.id === p.aupair_id;
  const other = isAp ? p.family : p.aupair;
  const myConfirmed = isAp ? p.aupair_confirmed : p.family_confirmed;
  const done = p.tasks.filter((x) => x.done).length;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T h2 style={{ flex: 1 }}>{tr('{aupair} with {family}', { aupair: p.aupair.name, family: p.family.name })}</T><Chip label={statusLabel(p.status)} tone={statusTone(p.status)} />
      </View>
      {error ? <Alert level="error" text={error} /> : null}
      <Card>
        {[[tr('Country'), cname(p.country)], [tr('Visa route'), p.program?.visa || tr('Check local rules')], [tr('Dates'), `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`],
          [tr('Hours / week'), p.weekly_hours], [tr('Pocket money'), tr('{amount} / month', { amount: `${p.pocket_money} ${p.program?.currency || ''}`.trim() })],
          [tr('Confirmed'), `${p.aupair_confirmed ? '✓' : '○'} ${tr('au pair')} · ${p.family_confirmed ? '✓' : '○'} ${tr('family')}`]].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', gap: 10 }}><T small muted style={{ width: 100 }}>{k}</T><T small style={{ flex: 1 }}>{String(v)}</T></View>
        ))}
        {p.program ? <Pressable onPress={() => router.push(`/programs/${p.program.code}`)}><T small style={{ color: C.primary }}>{tr('Open the {name} program guide', { name: country(p.program.code) })} →</T></Pressable> : null}
      </Card>
      <View style={{ gap: 8 }}>
        {p.status === 'proposed' && !myConfirmed ? <Button title={tr('Confirm placement')} onPress={() => act(() => api(`/placements/${id}/confirm`, { method: 'POST' }))} /> : null}
        {(NEXT[p.status] || []).map((s) => <Button key={s} kind="secondary" title={s === 'active' ? tr('Mark as active') : tr('Mark as completed')} onPress={() => act(() => api(`/placements/${id}/status`, { method: 'POST', body: { status: s } }))} />)}
        {['proposed', 'confirmed', 'active'].includes(p.status) ? <Button kind="ghost" small title={tr('Cancel placement')} onPress={() => act(() => api(`/placements/${id}/status`, { method: 'POST', body: { status: 'cancelled' } }))} /> : null}
      </View>
      {p.agreement ? (
        <Card>
          <T bold>{tr('Au pair agreement')}</T>
          <T small muted>{tr('PairMundo wrote it from your placement and the country rules. Read it, change what you need and sign it together.')}</T>
          <T small>{p.agreement.aupair_signed_at ? '✓' : '○'} {tr('au pair')} · {p.agreement.family_signed_at ? '✓' : '○'} {tr('family')}</T>
          <Button small kind={p.agreement.aupair_signed_at && p.agreement.family_signed_at ? 'ghost' : 'primary'} title={tr('Open the agreement')} onPress={() => router.push(`/agreement/${id}`)} />
        </Card>
      ) : null}
      <Card><T bold>{tr('Program check')}</T><ComplianceBox compliance={p.compliance} /></Card>
      <Card>
        <T bold>{tr('Checklist · {done} of {total} done', { done, total: p.tasks.length })}</T>
        {p.tasks.map((task) => (
          <Pressable key={task.id} onPress={() => act(async () => { await api(`/placements/${id}/tasks/${task.id}`, { method: 'PATCH', body: { done: !task.done } }); })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: t.line }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: task.done ? C.like : t.line, backgroundColor: task.done ? C.like : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {task.done ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <T style={task.done ? { textDecorationLine: 'line-through', color: t.muted } : null}>{tr(task.title)}</T>
              <T small muted>{task.owner === 'both' ? tr('Both') : task.owner === 'aupair' ? tr('Au pair') : tr('Family')} · {fmtDate(task.due_date)}</T>
              {task.link ? <Pressable onPress={() => Linking.openURL(task.link)} hitSlop={6}><T small style={{ color: C.primary }}>{tr('Official site')} ↗</T></Pressable> : null}
            </View>
          </Pressable>
        ))}
      </Card>
      {p.can_review ? (
        <Card>
          <T bold>{tr('Review {name}', { name: other.name })}</T>
          <T small muted>{tr('Your review stays hidden until {name} reviews you too, or 14 days after the placement ends.', { name: other.name })}</T>
          <T small bold>{tr('Overall')}</T>
          <StarInput value={review.overall} onChange={(n) => setReview((r) => ({ ...r, overall: n }))} />
          {p.review_criteria.map((c) => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T small>{CRIT_LABEL[c] ? tr(CRIT_LABEL[c]) : c}</T>
              <StarInput value={review.criteria[c]} onChange={(n) => setReview((r) => ({ ...r, criteria: { ...r.criteria, [c]: n } }))} />
            </View>
          ))}
          <Field label={tr('Your experience')} multiline value={review.comment} onChangeText={(v) => setReview((r) => ({ ...r, comment: v }))} placeholder={tr('What went well? What should others know?')} />
          <Button title={tr('Submit review')} disabled={!review.overall} onPress={() => act(() => api(`/placements/${id}/review`, { method: 'POST', body: review }))} />
        </Card>
      ) : p.my_review ? (
        <Card><T bold>{tr('Your review')}</T><Stars value={p.my_review.overall} /><T>{p.my_review.comment}</T></Card>
      ) : null}
    </Screen>
  );
}
