import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../api';
import { tr } from '../i18n';
import { Alert, Button, Card, Field, T } from './ui';

const STATUS = { sent: () => `⏳ ${tr('Waiting for their review')}`, confirmed: () => `✔ ${tr('Reviewed you')}`, declined: () => `✖ ${tr('Said they do not know you')}` };

/**
 * The au pair's reviews from past families: who they asked, and a form to ask another. Only the family's email is needed;
 * PairMundo emails them, and they make a free account to answer.
 */
export function MyReferences() {
  const [refs, setRefs] = useState(null);
  const [f, setF] = useState({ email: '', relation: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/me/references').then((d) => setRefs(d.references)).catch(() => setRefs([])), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const ask = async () => {
    setBusy(true); setMsg(null);
    try {
      await api('/me/references', { method: 'POST', body: f });
      setF({ email: '', relation: '' }); setMsg({ level: 'ok', text: tr('Sent. We emailed the family and asked them to review you.') }); load();
    } catch (e) { setMsg({ level: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const remove = async (id) => { await api(`/me/references/${id}`, { method: 'DELETE' }).catch(() => {}); load(); };

  return (
    <Card>
      <T h2>{tr('Reviews from past families')}</T>
      <T small muted>{tr("Did you look after children for a family before? Enter their email and we'll ask them to review you. They make a free account to answer, so families can trust the review is real. Their email stays private.")}</T>
      {(refs || []).map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T bold>{r.name || r.email}</T>
            <T small muted>{[r.name && r.email, r.relation].filter(Boolean).join(' · ')}</T>
            <T small>{STATUS[r.status]?.()}</T>
          </View>
          <Button title={tr('Remove')} kind="ghost" small onPress={() => remove(r.id)} />
        </View>
      ))}
      {refs && refs.filter((r) => r.status !== 'declined').length < 5 ? <>
        <Field label={tr("The family's email")} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label={tr('Where and when (optional)')} value={f.relation} onChangeText={set('relation')} placeholder={tr('For example: Munich, 2024 to 2025')} />
        <Button title={tr('Ask for a review')} kind="secondary" onPress={ask} loading={busy} disabled={!f.email} />
      </> : null}
      {msg ? <Alert level={msg.level} text={msg.text} /> : null}
    </Card>
  );
}
