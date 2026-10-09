import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '../api';
import { tr } from '../i18n';
import { Alert, Button, Card, Field, T } from './ui';

const STATUS = { sent: () => `⏳ ${tr('Waiting for an answer')}`, confirmed: () => `✔ ${tr('Confirmed')}`, declined: () => `✖ ${tr('Said they do not know you')}` };

/** The au pair's references: who they asked, and a form to ask someone new. PairMundo emails each one a short form. */
export function MyReferences() {
  const [refs, setRefs] = useState(null);
  const [f, setF] = useState({ name: '', email: '', relation: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/me/references').then((d) => setRefs(d.references)).catch(() => setRefs([])), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const ask = async () => {
    setBusy(true); setMsg(null);
    try {
      await api('/me/references', { method: 'POST', body: f });
      setF({ name: '', email: '', relation: '' }); setMsg({ level: 'ok', text: tr('Sent. We emailed them a short form.') }); load();
    } catch (e) { setMsg({ level: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const remove = async (id) => { await api(`/me/references/${id}`, { method: 'DELETE' }).catch(() => {}); load(); };

  return (
    <Card>
      <T h2>{tr('References')}</T>
      <T small muted>{tr('Add people you looked after children for, such as a family you babysat for or a kindergarten you worked at. We email them a short form, and families see their answers on your profile. Their email stays private.')}</T>
      {(refs || []).map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <T bold>{r.name}</T>
            <T small muted>{[r.email, r.relation].filter(Boolean).join(' · ')}</T>
            <T small>{STATUS[r.status]?.()}</T>
          </View>
          <Button title={tr('Remove')} kind="ghost" small onPress={() => remove(r.id)} />
        </View>
      ))}
      {refs && refs.filter((r) => r.status !== 'declined').length < 5 ? <>
        <Field label={tr('Name')} value={f.name} onChangeText={set('name')} />
        <Field label={tr('Email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label={tr('How you know them')} value={f.relation} onChangeText={set('relation')} placeholder={tr('For example: family I babysat for in 2025')} />
        <Button title={tr('Ask for a reference')} kind="secondary" onPress={ask} loading={busy} disabled={!f.name || !f.email} />
      </> : null}
      {msg ? <Alert level={msg.level} text={msg.text} /> : null}
    </Card>
  );
}
