import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { api } from '../api';
import { tr } from '../i18n';
import { C } from '../theme';
import { Button, T } from './ui';

/** The au pair's certificate checks, keyed by kind. */
export function useProofs() {
  const [proofs, setProofs] = useState({});
  const load = () => api('/me/certificates').then((r) => setProofs(Object.fromEntries(r.proofs.map((x) => [x.kind, x])))).catch(() => {});
  useEffect(() => { load(); }, []);
  return [proofs, load];
}

/** Under a saved certificate: its check status and a button to send a photo of it. */
export function CertProof({ kind, proof, saved, onSent }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async () => {
    setErr(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    try {
      // Large enough to read the small print, small enough for the 5 MB limit.
      const img = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 1600 } }], { compress: 0.85, format: SaveFormat.JPEG, base64: true });
      await api(`/me/certificates/${kind}/proof`, { method: 'POST', body: { data_url: `data:image/jpeg;base64,${img.base64}` } });
      onSent();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const status = proof?.status === 'verified' ? `✔ ${tr('Checked by PairMundo')}`
    : proof?.status === 'pending' ? `⏳ ${tr('We are checking it')}`
      : proof?.status === 'rejected' ? `✖ ${tr("We couldn't confirm it")}${proof.note ? `: ${proof.note}` : ''}` : null;
  if (!saved && !status) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
      {status ? <T small style={{ color: proof.status === 'verified' ? C.ok : proof.status === 'rejected' ? C.err : undefined }}>{status}</T> : null}
      {saved && proof?.status !== 'verified'
        ? <Button small kind="ghost" title={proof ? tr('Send a new copy') : tr('Get it checked')} onPress={send} loading={busy} /> : null}
      {err ? <T small style={{ color: C.err }}>{err}</T> : null}
    </View>
  );
}
