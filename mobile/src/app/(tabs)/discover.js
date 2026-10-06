import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { useAuth } from '../../auth';
import { api } from '../../api';
import { langName } from '../../data';
import { tr } from '../../i18n';
import { Alert, Button, ChoiceChips, Empty, Loading, RoundButton, T, useInsets } from '../../components/ui';
import { CountryPicker, MatchModal } from '../../components/pickers';
import { SwipeDeck } from '../../components/SwipeDeck';
import { brand, C, useTheme } from '../../theme';

const TOP_LANGS = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'da', 'pl'];

export default function Discover() {
  const { me, refresh } = useAuth();
  const t = useTheme();
  const insets = useInsets();
  const deckRef = useRef(null);
  const [deck, setDeck] = useState(null);
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [match, setMatch] = useState(null);
  const [error, setError] = useState(null);
  const isFamily = me.user.role === 'family';

  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const load = useCallback((frontId) => api(`/discover${qs ? `?${qs}` : ''}`).then(({ results }) => {
    if (frontId) { const i = results.findIndex((r) => r.user.id === frontId); if (i > 0) results.unshift(...results.splice(i, 1)); }
    setError(null); setDeck(results);
  }).catch((e) => { setError(e.message); setDeck([]); }), [qs]);
  useEffect(() => { load(); }, [load]);

  const onSwipe = async (card, direction) => {
    setDeck((d) => d.filter((x) => x.user.id !== card.user.id));
    try {
      const res = await api('/swipe', { method: 'POST', body: { target_id: card.user.id, direction } });
      if (res.matched) { setMatch({ other: res.other || card.user, conversation_id: res.conversation_id }); refresh().catch(() => {}); }
    } catch (e) {
      // Put the card back so the like isn't lost, then ask for the email code.
      if (e.data?.code === 'email_unverified') { setDeck((d) => [card, ...d]); router.push('/verify-email'); }
      else setError(e.message);
    }
  };
  // Top up the deck when it runs low.
  const deckLen = deck?.length ?? 0;
  useEffect(() => {
    if (deckLen > 0 && deckLen < 3) {
      api(`/discover${qs ? `?${qs}` : ''}`).then(({ results }) => setDeck((d) => [...d, ...results.filter((r) => !d.some((x) => x.user.id === r.user.id))])).catch(() => {});
    }
  }, [deckLen, qs]);

  const undo = async () => {
    try { const { user } = await api('/swipe/undo', { method: 'POST' }); await load(user.id); }
    catch (e) { setError(e.message); }
  };

  if (!deck) return <Loading />;
  const nFilters = Object.values(filters).filter(Boolean).length;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: C.primary }}>{brand.name}</Text>
        <Button small kind="ghost" title={`⚙ ${tr('Filters')}${nFilters ? ` (${nFilters})` : ''}`} onPress={() => setShowFilters(true)} />
      </View>
      {!me.user.email_verified ? (
        <Pressable onPress={() => router.push('/verify-email')} style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <Alert level="warning" text={`📧 ${tr('Confirm your email to start liking. Tap to enter your code.')}`} />
        </Pressable>
      ) : null}
      {!me.user.photos?.length ? (
        <Pressable onPress={() => router.navigate('/profile')} style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <Alert level="warning" text={`📸 ${isFamily ? tr('Add a photo so au pairs can see you. Tap here.') : tr('Add a photo so families can see you. Tap here.')}`} />
        </Pressable>
      ) : null}
      {error ? <View style={{ marginHorizontal: 16, marginBottom: 8 }}><Alert level="error" text={error} /></View> : null}
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        {deck.length ? (
          <SwipeDeck ref={deckRef} cards={deck} onSwipe={onSwipe} onOpen={(r) => router.push(`/user/${r.user.id}`)} />
        ) : (
          <Empty title={tr("You've seen everyone for now")} text={isFamily ? tr('New au pairs join every day. Widen your filters or take another look at people you passed.') : tr('New families join every day. Widen your filters or take another look at people you passed.')}>
            <Button title={tr('Show passed profiles again')} kind="secondary" onPress={async () => { await api('/swipes/passes', { method: 'DELETE' }); load(); }} />
            {nFilters ? <Button title={tr('Clear filters')} kind="ghost" onPress={() => setFilters({})} /> : null}
          </Empty>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 14 }}>
        <RoundButton size="sm" icon="↺" color={C.gold} onPress={undo} label={tr('Undo')} />
        <RoundButton icon="✕" color={C.nope} onPress={() => deckRef.current?.swipe('pass')} disabled={!deck.length} label={tr('Pass')} />
        <RoundButton size="sm" icon="★" color={C.super} onPress={() => deckRef.current?.swipe('super')} disabled={!deck.length} label={tr('Super like')} />
        <RoundButton icon="♥" color={C.like} onPress={() => deckRef.current?.swipe('like')} disabled={!deck.length} label={tr('Like')} />
        <RoundButton size="sm" icon="ⓘ" color={C.purple} onPress={() => deck[0] && router.push(`/user/${deck[0].user.id}`)} disabled={!deck.length} label={tr('Profile')} />
      </View>

      <MatchModal match={match} me={me.user} onClose={() => setMatch(null)}
        onMessage={() => { const id = match.conversation_id; setMatch(null); router.push(`/chat/${id}`); }} />

      <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <FiltersSheet initial={filters} isFamily={isFamily} onClose={() => setShowFilters(false)} onApply={(f) => { setFilters(f); setShowFilters(false); setDeck(null); }} />
        </View>
      </Modal>
    </View>
  );
}

function FiltersSheet({ initial, isFamily, onApply, onClose }) {
  const t = useTheme();
  const insets = useInsets();
  const [f, setF] = useState(initial);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <View style={{ backgroundColor: t.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, paddingBottom: insets.bottom + 20 }}>
      <T h2>{tr('Filters')}</T>
      <CountryPicker label={isFamily ? tr('Au pair lives in') : tr('Family country')} value={f.country} onChange={set('country')} allowAny={tr('Anywhere')} />
      {isFamily ? <CountryPicker label={tr('Nationality')} value={f.nationality} onChange={set('nationality')} allowAny={tr('Any')} /> : null}
      <ChoiceChips label={tr('Speaks')} options={Object.fromEntries(TOP_LANGS.map((k) => [k, langName(k)]))} value={f.language} onChange={set('language')} />
      <ChoiceChips label={tr('Only show')} options={{ verified: `✔ ${tr('ID verified')}`, ...(isFamily ? { driver: `🚗 ${tr('Drivers')}` } : {}) }} multi
        value={[f.verified && 'verified', f.driver && 'driver'].filter(Boolean)}
        onChange={(v) => setF((x) => ({ ...x, verified: v.includes('verified') ? '1' : '', driver: v.includes('driver') ? '1' : '' }))} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={tr('Clear')} kind="ghost" style={{ flex: 1 }} onPress={() => onApply({})} />
        <Button title={tr('Apply')} style={{ flex: 2 }} onPress={() => onApply(f)} />
      </View>
      <Button title={tr('Cancel')} kind="ghost" small onPress={onClose} />
    </View>
  );
}
