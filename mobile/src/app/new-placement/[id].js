import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { cname } from '../../data';
import { Alert, Button, Card, ComplianceBox, Field, Loading, Screen, T } from '../../components/ui';

const addMonths = (iso, m) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

export default function NewPlacement() {
  const { id } = useLocalSearchParams();
  const { me } = useAuth();
  const [other, setOther] = useState(null);
  const [f, setF] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/users/${id}`).then((d) => {
      setOther(d);
      const fam = me.user.role === 'family' ? me.profile : d.profile;
      const start = fam?.start_date || new Date().toISOString().slice(0, 10);
      setF({ start_date: start, end_date: addMonths(start, fam?.duration_months || 12), weekly_hours: String(fam?.weekly_hours ?? 30), pocket_money: String(fam?.pocket_money ?? '') });
    }).catch((e) => setError(e.message));
  }, [id]);

  const body = f && { ...f, other_user_id: Number(id), weekly_hours: Number(f.weekly_hours), pocket_money: Number(f.pocket_money) };
  useEffect(() => {
    if (!f) return undefined;
    const tm = setTimeout(() => api('/compliance/check', { method: 'POST', body }).then(setCompliance).catch(() => {}), 300);
    return () => clearTimeout(tm);
  }, [JSON.stringify(f)]);

  if (!f) return error ? <Screen><Alert level="error" text={error} /></Screen> : <Loading />;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const country = me.user.role === 'family' ? me.user.country : other.user.country;
  const submit = async () => {
    setBusy(true); setError(null);
    try { const r = await api('/placements', { method: 'POST', body }); router.replace(`/placement/${r.id}`); }
    catch (e) { setError(e.message); if (e.data?.compliance) setCompliance(e.data.compliance); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <T h2>With {other.user.name}</T>
      <T muted>{`Country: ${cname(country)}. You both confirm before it's final.`}</T>
      <Field label="Start date (YYYY-MM-DD)" value={f.start_date} onChangeText={set('start_date')} />
      <Field label="End date (YYYY-MM-DD)" value={f.end_date} onChangeText={set('end_date')} />
      <Field label="Hours per week" value={f.weekly_hours} onChangeText={set('weekly_hours')} keyboardType="numeric" />
      <Field label="Pocket money per month (local currency)" value={f.pocket_money} onChangeText={set('pocket_money')} keyboardType="numeric" />
      <Card><T bold>Program check</T>{compliance ? <ComplianceBox compliance={compliance} /> : <T muted>Checking…</T>}</Card>
      {error ? <Alert level="error" text={error} /> : null}
      <Button title="Send proposal" onPress={submit} loading={busy} disabled={compliance && !compliance.ok} />
    </Screen>
  );
}
