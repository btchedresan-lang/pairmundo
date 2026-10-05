import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { fmtTime } from '../../data';
import { Alert, Loading, Photo, useInsets } from '../../components/ui';
import { chooseAsync, confirmAsync } from '../../components/dialogs';
import { C, useTheme } from '../../theme';

export default function Chat() {
  const { id } = useLocalSearchParams();
  const { me, refresh } = useAuth();
  const t = useTheme();
  const insets = useInsets();
  const [other, setOther] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const list = useRef(null);
  const lastId = useRef(0);

  const add = (items) => {
    if (!items.length) return;
    lastId.current = Math.max(lastId.current, ...items.map((m) => m.id));
    setMsgs((m) => [...m, ...items.filter((x) => !m.some((y) => y.id === x.id))]);
  };
  useEffect(() => {
    let alive = true;
    api(`/conversations/${id}/messages`).then((d) => { if (alive) { setOther(d.other); add(d.messages); } }).catch((e) => setError(e.message));
    // Light polling for new messages while the chat is open.
    const timer = setInterval(() => {
      api(`/conversations/${id}/messages?after=${lastId.current}`).then((d) => alive && add(d.messages)).catch(() => {});
    }, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, [id]);

  const send = async () => {
    const body = text.trim(); if (!body) return;
    setText('');
    try { add([await api(`/conversations/${id}/messages`, { method: 'POST', body: { body } })]); }
    catch (e) { setText(body); if (e.data?.code === 'email_unverified') router.push('/verify-email'); else setError(e.message); }
  };

  const menu = async () => {
    const pick = await chooseAsync(other.name, [
      { key: 'report', label: 'Report and block', destructive: true },
      { key: 'block', label: 'Block', destructive: true },
    ]);
    if (!pick) return;
    if (!(await confirmAsync(`Block ${other.name}?`, pick === 'report'
      ? 'We will send this chat to our safety team. You will no longer see each other.'
      : "You won't see each other anywhere in the app. They aren't told.", 'Block', true))) return;
    try {
      await api(`/users/${other.id}/block`, { method: 'POST', body: pick === 'report' ? { reason: `Reported from chat ${id}` } : {} });
      refresh().catch(() => {});
      router.back();
    } catch (e) { setError(e.message); }
  };

  if (!other && !error) return <Loading />;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ headerTitle: () => other ? (
        <Pressable onPress={() => router.push(`/user/${other.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Photo user={other} rounded style={{ width: 32, height: 32 }} /><Text style={{ color: t.ink, fontWeight: '700', fontSize: 16 }}>{other.name}</Text>
        </Pressable>) : null,
      headerRight: () => other ? <Pressable onPress={menu} accessibilityLabel="Report or block" hitSlop={10}><Text style={{ color: C.primary, fontSize: 22, fontWeight: '800', paddingHorizontal: 6 }}>⋯</Text></Pressable> : null }} />
      {error ? <View style={{ padding: 12 }}><Alert level="error" text={error} /></View> : null}
      <FlatList ref={list} data={msgs} keyExtractor={(m) => String(m.id)} contentContainerStyle={{ padding: 14, gap: 8 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={{ color: t.muted, textAlign: 'center', marginTop: 40 }}>You matched! Say hello 👋</Text>}
        renderItem={({ item: m }) => {
          const mine = m.sender_id === me.user.id;
          return (
            <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', backgroundColor: mine ? C.primary : t.card,
              borderRadius: 18, borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Text style={{ color: mine ? '#fff' : t.ink, fontSize: 15 }}>{m.body}</Text>
              <Text style={{ color: mine ? 'rgba(255,255,255,0.75)' : t.muted, fontSize: 11, marginTop: 2 }}>{fmtTime(m.created_at)}</Text>
            </View>
          );
        }} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
        <TextInput value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={t.muted} multiline
          onSubmitEditing={send} blurOnSubmit={false} returnKeyType="send"
          style={{ flex: 1, maxHeight: 120, borderWidth: 1, borderColor: t.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: t.ink, backgroundColor: t.bg }} />
        <Pressable onPress={send} accessibilityLabel="Send" style={{ backgroundColor: C.primary, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
