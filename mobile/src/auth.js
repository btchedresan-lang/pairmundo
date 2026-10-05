import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, loadSession, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null); // { user, profile, rating, counts }
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try { const d = await api('/me'); setMe(d); return d; }
    catch (e) { if (e.status === 401) { await setToken(null); setMe(null); } throw e; }
  }, []);

  useEffect(() => {
    (async () => {
      const { token } = await loadSession();
      if (token) await refresh().catch(() => {});
      setReady(true);
    })();
  }, [refresh]);

  // Keep badge counts fresh while signed in.
  useEffect(() => {
    if (!me) return undefined;
    const t = setInterval(() => refresh().catch(() => {}), 20000);
    return () => clearInterval(t);
  }, [!!me, refresh]);

  const signIn = async (path, body) => {
    const r = await api(path, { method: 'POST', body });
    await setToken(r.token);
    return refresh();
  };
  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    await setToken(null);
    setMe(null);
  };

  return <AuthContext.Provider value={{ me, ready, refresh, signIn, signOut, setMe }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
