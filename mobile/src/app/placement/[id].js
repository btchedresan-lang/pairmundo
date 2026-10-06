import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { cname, CRIT_LABEL, fmtDate, statusTone } from '../../data';
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
        <T h2 style={{ flex: 1 }}>{p.aupair.name} with {p.family.name}</T><Chip label={p.status} tone={statusTone(p.status)} />
      </View>
      {error ? <Alert level="error" text={error} /> : null}
      <Card>
        {[['Country', cname(p.country)], ['Visa route', p.program?.visa || 'Check local rules'], ['Dates', `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}`],
          ['Hours / week', p.weekly_hours], ['Pocket money', `${p.pocket_money} ${p.program?.currency || ''} / month`],
          ['Confirmed', `${p.aupair_confirmed ? '✓' : '○'} au pair · ${p.family_confirmed ? '✓' : '○'} family`]].map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', gap: 10 }}><T small muted style={{ width: 100 }}>{k}</T><T small style={{ flex: 1 }}>{String(v)}</T></View>
        ))}
        {p.program ? <Pressable onPress={() => router.push(`/programs/${p.program.code}`)}><T small style={{ color: C.primary }}>Open the {p.program.name} program guide →</T></Pressable> : null}
      </Card>
      <View style={{ gap: 8 }}>
        {p.status === 'proposed' && !myConfirmed ? <Button title="Confirm placement" onPress={() => act(() => api(`/placements/${id}/confirm`, { method: 'POST' }))} /> : null}
        {(NEXT[p.status] || []).map((s) => <Button key={s} kind="secondary" title={`Mark as ${s}`} onPress={() => act(() => api(`/placements/${id}/status`, { method: 'POST', body: { status: s } }))} />)}
        {['proposed', 'confirmed', 'active'].includes(p.status) ? <Button kind="ghost" small title="Cancel placement" onPress={() => act(() => api(`/placements/${id}/status`, { method: 'POST', body: { status: 'cancelled' } }))} /> : null}
      </View>
      <Card><T bold>Program check</T><ComplianceBox compliance={p.compliance} /></Card>
      <Card>
        <T bold>Checklist · {done} of {p.tasks.length} done</T>
        {p.tasks.map((task) => (
          <Pressable key={task.id} onPress={() => act(async () => { await api(`/placements/${id}/tasks/${task.id}`, { method: 'PATCH', body: { done: !task.done } }); })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: t.line }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: task.done ? C.like : t.line, backgroundColor: task.done ? C.like : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {task.done ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <T style={task.done ? { textDecorationLine: 'line-through', color: t.muted } : null}>{task.title}</T>
              <T small muted>{task.owner === 'both' ? 'Both' : task.owner === 'aupair' ? 'Au pair' : 'Family'} · {fmtDate(task.due_date)}</T>
            </View>
          </Pressable>
        ))}
      </Card>
      {p.can_review ? (
        <Card>
          <T bold>Review {other.name}</T>
          <T small muted>Your review stays hidden until {other.name} reviews you too, or 14 days after the placement ends.</T>
          <T small bold>Overall</T>
          <StarInput value={review.overall} onChange={(n) => setReview((r) => ({ ...r, overall: n }))} />
          {p.review_criteria.map((c) => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T small>{CRIT_LABEL[c] || c}</T>
              <StarInput value={review.criteria[c]} onChange={(n) => setReview((r) => ({ ...r, criteria: { ...r.criteria, [c]: n } }))} />
            </View>
          ))}
          <Field label="Your experience" multiline value={review.comment} onChangeText={(v) => setReview((r) => ({ ...r, comment: v }))} placeholder="What went well? What should others know?" />
          <Button title="Submit review" disabled={!review.overall} onPress={() => act(() => api(`/placements/${id}/review`, { method: 'POST', body: review }))} />
        </Card>
      ) : p.my_review ? (
        <Card><T bold>Your review</T><Stars value={p.my_review.overall} /><T>{p.my_review.comment}</T></Card>
      ) : null}
    </Screen>
  );
}
