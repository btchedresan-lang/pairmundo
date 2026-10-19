import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '../../components/Text';
import { api } from '../../api';
import { fmtDate } from '../../data';
import { tr } from '../../i18n';
import { Alert, Button, Card, Chip, Field, Loading, Screen, T } from '../../components/ui';
import { VisaCard } from '../../components/Visa';
import { C, useTheme } from '../../theme';

// The letter comes as [English sentence, values] pairs, like the agreement; each is translated here.
const clause = ([text, vars]) => tr(text, Object.fromEntries(Object.entries(vars || {}).map(([k, v]) => [k, ['start', 'end'].includes(k) ? fmtDate(v) : v])));

/** The family's visa documents for a placement, and the invitation letter PairMundo writes for them. */
export default function Documents() {
  const { id } = useLocalSearchParams();
  const t = useTheme();
  const [d, setD] = useState(null);
  const [address, setAddress] = useState('');
  const [error, setError] = useState(null);
  const show = (r) => { setD(r); setAddress(r.address); };
  useFocusEffect(useCallback(() => { api(`/placements/${id}/documents`).then(show).catch((e) => setError(e.message)); }, [id]));
  const save = async (body) => { setError(null); try { show(await api(`/placements/${id}/documents`, { method: 'PUT', body })); } catch (e) { setError(e.message); } };

  if (!d) return error ? <Screen><Alert level="error" text={error} /></Screen> : <Loading />;
  return (
    <Screen>
      {error ? <Alert level="error" text={error} /> : null}
      <Card>
        <T bold>{tr('Visa documents')}</T>
        <T small muted>{tr('What the host family usually hands in. Each country asks for its own, so check the official site too.')}</T>
        {d.documents.map((x) => (
          <Pressable key={x.key} disabled={!d.editable} onPress={() => save({ doc: x.key, done: !x.done })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: t.line }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: x.done ? C.like : t.line, backgroundColor: x.done ? C.like : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {x.done ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T style={x.done ? { textDecorationLine: 'line-through', color: t.muted } : null}>{tr(x.title)}</T>
              {x.made ? <View style={{ flexDirection: 'row' }}><Chip tone="ok" label={tr('PairMundo writes this')} /></View> : null}
              {x.made === 'agreement' ? <Pressable onPress={() => router.push(`/agreement/${id}`)} hitSlop={6}><T small style={{ color: C.primary }}>{tr('Open the agreement')} →</T></Pressable> : null}
            </View>
          </Pressable>
        ))}
      </Card>
      <Card>
        <T h2>{tr('Invitation letter')}</T>
        {d.letter.map((x) => <T key={x[0]}>{clause(x)}</T>)}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <View style={{ flex: 1, borderTopWidth: 1, borderColor: t.line, paddingTop: 8 }}><T small muted>{tr('Host family')}</T><T>{d.family_name}</T></View>
          <View style={{ flex: 1, borderTopWidth: 1, borderColor: t.line, paddingTop: 8 }}><T small muted>{tr('Place and date')}</T></View>
        </View>
        <T small muted>{tr('Print and sign it from the website, under Placements.')}</T>
      </Card>
      {d.editable ? (
        <Card>
          <Field label={tr('Your address for the letter')} value={address} onChangeText={setAddress} placeholder={tr('Street, postcode and city')} />
          <Button small kind="secondary" title={tr('Save address')} onPress={() => save({ address })} />
        </Card>
      ) : null}
      <VisaCard visa={d.route} placementId={d.placement_id} />
    </Screen>
  );
}
