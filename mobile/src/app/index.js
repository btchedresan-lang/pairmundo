import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '../auth';
import { store } from '../storage';
import { needsSetup, setupKey } from './setup';

export default function Index() {
  const { me } = useAuth();
  // New members with an empty profile get the short setup once; "skip" is remembered on this device.
  const ask = needsSetup(me) ? me.user.id : null;
  const [skipped, setSkipped] = useState({});
  useEffect(() => {
    if (ask) store.get(setupKey(ask)).then((v) => setSkipped((s) => ({ ...s, [ask]: !!v })), () => setSkipped((s) => ({ ...s, [ask]: true })));
  }, [ask]);
  if (!me) return <Redirect href="/login" />;
  if (!ask) return <Redirect href="/discover" />;
  if (skipped[ask] === undefined) return null;
  return <Redirect href={skipped[ask] ? '/discover' : '/setup'} />;
}
