// Video call rooms for matched families and au pairs.
// With DAILY_API_KEY set (https://dashboard.daily.co), each call gets a private Daily room that closes after two hours,
// and each person joins with their own meeting token. Without it, calls use a hard-to-guess Jitsi Meet room
// (JITSI_DOMAIN, default meet.jit.si), which works without an account but may ask the first person to sign in.
import { randomBytes } from 'node:crypto';

export const CALL_HOURS = 2;

export function createVideo({ apiKey = process.env.DAILY_API_KEY, jitsiDomain = process.env.JITSI_DOMAIN || 'meet.jit.si', fetchImpl = fetch } = {}) {
  const daily = async (path, body) => {
    const res = await fetchImpl(`https://api.daily.co/v1${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Daily ${path} failed (${res.status}): ${await res.text()}`);
    return res.json();
  };
  const exp = () => Math.floor(Date.now() / 1000) + CALL_HOURS * 3600;
  return {
    provider: apiKey ? 'daily' : 'jitsi',
    /** A new room; returns its address, which on its own does not let anyone in when Daily is used. */
    async createRoom() {
      if (!apiKey) return `https://${jitsiDomain}/PairMundo-${randomBytes(12).toString('hex')}`;
      const room = await daily('/rooms', { privacy: 'private', properties: { exp: exp(), eject_at_room_exp: true, enable_prejoin_ui: true, enable_chat: false, max_participants: 4 } });
      return room.url;
    },
    /** The link one person opens to join. */
    async joinUrl(roomUrl, name) {
      if (!roomUrl.startsWith('https://') || !apiKey || !/\.daily\.co\//.test(roomUrl)) {
        return `${roomUrl}#userInfo.displayName=${encodeURIComponent(JSON.stringify(name))}`;
      }
      const { token } = await daily('/meeting-tokens', { properties: { room_name: roomUrl.split('/').pop(), user_name: name, exp: exp() } });
      return `${roomUrl}?t=${token}`;
    },
  };
}
