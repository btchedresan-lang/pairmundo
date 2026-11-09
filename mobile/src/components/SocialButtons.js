// "Continue with Apple" and "Continue with Google" on the sign-in and sign-up screens.
// Someone new is asked once whether they are a family or an au pair, and their name; their email is already confirmed.
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { api, setToken } from '../api';
import { useAuth } from '../auth';
import { tr } from '../i18n';
import { appleAvailable, appleSignIn, Cancelled, googleAvailable, googleSignIn } from '../social';
import { useTheme } from '../theme';
import { Text } from './Text';
import { Alert, Button, ChoiceChips, Field, T, useInsets } from './ui';

const MEMBER_ROLES = ['aupair', 'family'];

export function SocialButtons({ role: presetRole }) {
  const { refresh, signOut } = useAuth();
  const t = useTheme();
  const insets = useInsets();
  const [apple, setApple] = useState(false);
  const [google] = useState(googleAvailable);
  const [providers, setProviders] = useState(null); // what the server can check
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ask, setAsk] = useState(null); // { provider, id_token, name, role, ref_code } while asking a new person
  useEffect(() => { appleAvailable().then(setApple); }, []);
  useEffect(() => { api('/auth/providers').then((d) => setProviders(d.providers || [])).catch(() => setProviders([])); }, []);

  const showApple = apple && providers?.includes('apple');
  const showGoogle = google && providers?.includes('google');
  if (!showApple && !showGoogle) return null;

  const send = async (body) => {
    const r = await api('/auth/social', { method: 'POST', body });
    if (r.needs_profile) return false;
    await setToken(r.token);
    const me = await refresh();
    // Agencies and admins use the website, as on the email sign-in.
    if (!MEMBER_ROLES.includes(me.user.role)) { await signOut(); throw new Error(tr('Agency accounts are on the website. Sign in at pairmundo.com.')); }
    return true;
  };
  const go = (provider) => async () => {
    setErr(null); setBusy(true);
    try {
      const { id_token, name } = provider === 'apple' ? await appleSignIn() : await googleSignIn();
      if (!(await send({ provider, id_token }))) setAsk({ provider, id_token, name, role: presetRole || null, ref_code: '' });
    } catch (e) { if (!(e instanceof Cancelled)) setErr(e.message); } finally { setBusy(false); }
  };
  const finish = async () => {
    setErr(null); setBusy(true);
    try { await send({ provider: ask.provider, id_token: ask.id_token, role: ask.role, name: ask.name.trim(), ref_code: ask.ref_code.trim() }); setAsk(null); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} /><T small muted>{tr('or')}</T><View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
      </View>
      {showApple ? (
        <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={999} style={{ height: 48, opacity: busy ? 0.5 : 1 }}
          onPress={busy ? () => {} : go('apple')} />
      ) : null}
      {showGoogle ? (
        <Pressable onPress={go('google')} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => ({ height: 48, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: '#fff', flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center', gap: 10, opacity: busy ? 0.5 : pressed ? 0.8 : 1 })}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#4285F4' }}>G</Text>
          <Text style={{ color: '#1f1f1f', fontWeight: '600', fontSize: 16 }}>{tr('Continue with Google')}</Text>
        </Pressable>
      ) : null}
      {err && !ask ? <Alert level="error" text={err} /> : null}

      <Modal visible={!!ask} animationType="slide" transparent onRequestClose={() => setAsk(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          {ask ? (
            <View style={{ backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, paddingBottom: insets.bottom + 20 }}>
              <T h2>{tr('Almost there')}</T>
              <ChoiceChips label={tr('I am')} options={{ family: `🏡 ${tr('A host family')}`, aupair: `🎒 ${tr('An au pair')}` }} value={ask.role} onChange={(v) => setAsk((a) => ({ ...a, role: v }))} />
              <Field label={tr('Name')} hint={tr('Other members see only your first name and last initial, like Maria L. Your full name is shared once you both confirm a placement.')}
                value={ask.name} onChangeText={(v) => setAsk((a) => ({ ...a, name: v }))} placeholder={ask.role === 'family' ? tr('The Smith Family') : 'Maria Lopez'} textContentType="name" autoComplete="name" />
              <Field label={tr('Referral code (optional)')} value={ask.ref_code} onChangeText={(v) => setAsk((a) => ({ ...a, ref_code: v }))} autoCapitalize="characters" placeholder={tr('From the person or agency who invited you')} />
              {err ? <Alert level="error" text={err} /> : null}
              <Button title={tr('Create account')} onPress={finish} loading={busy} disabled={!ask.role || !ask.name.trim()} />
              <Button title={tr('Cancel')} kind="ghost" small onPress={() => { setAsk(null); setErr(null); }} />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
