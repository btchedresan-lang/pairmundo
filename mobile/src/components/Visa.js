// Visa help: what the visa takes for a match or placement, and the "Get help from a partner agency" button.
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { country, fmtDate } from '../data';
import { tr } from '../i18n';
import { confirmAsync } from './dialogs';
import { Alert, Button, Card, T } from './ui';
import { C } from '../theme';

/** Asks before sharing the person's details with the agency, then shows the referral code. */
export function ReferButton({ agency, placementId }) {
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (sent) return <Alert level="ok" text={`✓ ${tr('Sent to {name}. They will contact you by email. Your referral code is {code}.', { name: sent.agency, code: sent.code })}`} />;
  const refer = async () => {
    const ok = await confirmAsync(tr('Get help from {name}', { name: agency.name }),
      tr('{name} will get your name, email and country so they can help you with the visa. Share your details?', { name: agency.name }), tr('Share'));
    if (!ok) return;
    setBusy(true); setError(null);
    try { setSent(await api(`/partner-offers/${agency.id}/refer`, { method: 'POST', body: { consent: true, placement_id: placementId } })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 4 }}>
      <Button small kind="secondary" title={tr('Get help from {name}', { name: agency.name })} loading={busy} onPress={refer} />
      {agency.blurb ? <T small muted>{agency.blurb}</T> : null}
      {error ? <Alert level="error" text={error} /> : null}
    </View>
  );
}

/** The visa route the server works out (visaRoute in programs.js), with the viewer's own steps. */
export function VisaCard({ visa: v, placementId }) {
  const { me } = useAuth();
  if (!v) return null;
  const where = country(v.country);
  const mine = me.user.role === 'family' ? ['family', 'both'] : ['aupair', 'both'];
  const steps = (v.steps || []).filter((x) => mine.includes(x.owner));
  const head = {
    none: <Alert level="ok" text={`✓ ${tr('No visa needed: free movement applies.')}`} />,
    unknown: <T small muted>{tr("The au pair hasn't added a nationality yet, so we can't show the visa steps.")}</T>,
    closed: <Alert level="error" text={`✖ ${tr('There is no au pair visa route into {country} for this nationality right now.', { country: where })}`} />,
    paused: <Alert level="warning" text={`⚠ ${tr("{country}'s au pair visas are currently stalled", { country: where })}`} />,
  }[v.kind] || <Alert level="info" text={`🛂 ${tr('A visa is needed. Allow about {weeks} weeks for the paperwork.', { weeks: v.weeks })}`} />;
  return (
    <Card>
      <T bold>{tr('Visa')}</T>
      {head}
      {v.apply_by && v.kind !== 'paused' ? <T small bold>{tr('Start the paperwork by {date}.', { date: fmtDate(v.apply_by) })}</T> : null}
      {v.apply_by && v.kind !== 'paused' && v.apply_by < new Date().toISOString().slice(0, 10) ? <T small style={{ color: C.warn }}>{tr('That date has passed, so this start date may be too soon.')}</T> : null}
      {v.weeks ? <T small muted>{tr('Visa route')}: {v.visa}</T> : null}
      {v.kind === 'sponsor' ? <>
        <T small>{tr('{country} grants this visa only through a sponsor agency.', { country: where })}</T>
        {(v.agencies || []).map((a) => <ReferButton key={a.id} agency={a} placementId={placementId} />)}
      </> : null}
      {steps.length ? <>
        <T small bold>{tr('Your steps')}</T>
        {steps.map((x, i) => <T key={x.title} small>{i + 1}. {tr(x.title)}</T>)}
      </> : null}
      {v.kind !== 'unknown' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <T small muted>{tr('A guide only: check the official site before you apply.')}</T>
          {v.official_source ? <Pressable onPress={() => Linking.openURL(v.official_source)} hitSlop={6}><T small style={{ color: C.primary }}>{tr('Official site')} ↗</T></Pressable> : null}
        </View>
      ) : null}
    </Card>
  );
}
