// Sends push notifications to phones through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).
// EXPO_ACCESS_TOKEN is only needed if "Enhanced security for push notifications" is turned on in the Expo account.

export const isPushToken = (t) => /^Expo(nent)?PushToken\[[^\]]{10,200}\]$/.test(String(t || ''));

/** Returns one ticket per message, in order: { status: 'ok' } or { status: 'error', details: { error } }. */
export function createPusher() {
  return async (messages) => {
    const tickets = [];
    for (let i = 0; i < messages.length; i += 100) { // Expo accepts up to 100 per request
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      if (!res.ok) throw new Error(`Push send failed (${res.status}): ${await res.text()}`);
      tickets.push(...((await res.json()).data || []));
    }
    return tickets;
  };
}
