import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../haptics';
import { SWIPE, swipeDecision, swipeIntent } from '../swipeRules';
import { HEADING, Text } from './Text';
import { C, lift } from '../theme';
import { country, fmtDate, flag, langName } from '../data';
import { tr, trn } from '../i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { imageUrl } from '../api';
import { Photo } from './ui';

const W = Dimensions.get('window').width;
const H = Dimensions.get('window').height;
// When a drag counts is decided in ../swipeRules.js (tested in test/swipe.test.mjs). The stamps fade in over the
// same distance, so the LIKE or NOPE stamp is fully shown exactly when letting go would count.
const nativeDriver = Platform.OS !== 'web';
const START_SIZE = { width: W - 24, height: H * 0.65 };

/** Photo carousel with Tinder-style progress bars. Tap the left or right half to move between photos. */
export function Gallery({ user, style, onPressInfo, children }) {
  const photos = user.photos?.length ? user.photos : [];
  const [i, setI] = useState(0);
  const [w, setW] = useState(W);
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#222' }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={(e) => {
        if (photos.length < 2) return onPressInfo?.();
        const x = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? w;
        setI((cur) => (x < w / 2 ? Math.max(0, cur - 1) : Math.min(photos.length - 1, cur + 1)));
      }}>
        <Photo user={user} uri={photos[i]} style={StyleSheet.absoluteFill} />
      </Pressable>
      {photos.length > 1 ? (
        <View style={styles.bars} pointerEvents="none">
          {photos.map((p, j) => <View key={p} style={[styles.bar, j === i && { backgroundColor: '#fff' }]} />)}
        </View>
      ) : null}
      {/* Keep the next photos warm so flipping is instant. */}
      {photos.slice(1, 3).map((p) => <Photo key={`pre-${p}`} uri={imageUrl(p)} user={user} style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} />)}
      {children}
    </View>
  );
}

export function CardCaption({ r, onPress }) {
  const u = r.user; const p = r.profile || {};
  const age = u.role === 'aupair' ? p.age : null;
  const kids = p.children?.length ? `${trn(p.children.length, '{n} child', '{n} kids')} (${p.children.map((c) => c.age).join(', ')})` : '';
  // Au pairs' languages show their level too, such as "English C1".
  const langs = (p.languages || []).map((l) => (u.role === 'aupair' ? `${langName(l.code)}${l.level && l.level !== 'native' ? ` ${l.level}` : ''}` : langName(l)));
  const sub = u.role === 'aupair'
    ? [p.childcare_years ? tr('{n} yrs childcare', { n: p.childcare_years }) : '', p.available_from ? tr('from {date}', { date: fmtDate(p.available_from) }) : ''].filter(Boolean).join(' · ')
    : [kids, p.start_date ? tr('starts {date}', { date: fmtDate(p.start_date) }) : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} style={styles.caption}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={2}>{u.name}{age ? <Text style={{ opacity: 0.85 }}>  {age}</Text> : null}</Text>
        {u.verification?.id ? <Ionicons name="checkmark-circle" size={24} color="#6cc4ff" accessibilityLabel={tr('ID verified')} /> : null}
      </View>
      <Text style={[styles.sub, { marginTop: 4 }]}>{flag(u.country)} {[u.city, country(u.country)].filter(Boolean).join(', ')}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {langs.slice(0, 3).map((l) => <Text key={l} style={styles.glass}>{l}</Text>)}
        {r.rating?.avg ? <Text style={styles.glass}>★ {r.rating.avg}</Text> : null}
        {u.agency ? <Text style={styles.glass} numberOfLines={1}><Ionicons name="school-outline" size={13} color="#fff" /> {u.agency}</Text> : null}
        {u.role === 'aupair' && p.drivers_license ? <Text style={styles.glass}><Ionicons name="car-outline" size={13} color="#fff" /> {tr('Driver')}</Text> : null}
        {u.role === 'aupair' && (p.certificates || []).some((c) => ['cpr', 'first_aid'].includes(c.kind)) ? <Text style={styles.glass}><Ionicons name="medkit-outline" size={13} color="#fff" /> {tr('CPR')}</Text> : null}
      </View>
      {r.match?.reasons?.length ? <Text style={styles.reason}><Ionicons name="checkmark" size={14} color="#7ee2a8" /> {tr(r.match.reasons[0])}</Text> : null}
      {r.match?.warnings?.length ? <Text style={styles.warning}><Ionicons name="alert-circle-outline" size={14} color="#ffd8a8" /> {tr(r.match.warnings[0])}</Text> : null}
    </Pressable>
  );
}

export const Shade = () => <LinearGradient pointerEvents="none" colors={['rgba(20,18,30,0)', 'rgba(20,18,30,0.22)', 'rgba(20,18,30,0.62)']} locations={[0, 0.5, 1]} style={styles.shade} />;

function Stamp({ label, color, style, opacity }) {
  return <Animated.View pointerEvents="none" style={[styles.stamp, { borderColor: color, opacity }, style]}><Text style={[styles.stampText, { color }]}>{label}</Text></Animated.View>;
}

/**
 * Card stack. Drag right to like, left to pass, up to super like.
 * `ref.current.swipe(direction)` lets the buttons below the deck trigger the same animation.
 */
export function SwipeDeck({ cards, onSwipe, onOpen, ref }) {
  const [pos] = useState(() => new Animated.ValueXY());
  const busy = useRef(false);
  const [dims, setDims] = useState(START_SIZE); // the card's size, measured below
  const intent = useRef(null); // where letting go would send the card right now, for the haptic tick
  // Gesture handlers are created once, so they read the current cards and callback from here.
  const latest = useRef({ cards, onSwipe, dims: START_SIZE });
  useEffect(() => { latest.current = { cards, onSwipe, dims }; });
  const top = cards[0];

  const [flyOut] = useState(() => (direction) => {
    const card = latest.current.cards[0];
    if (busy.current || !card) return;
    busy.current = true;
    haptic.swipe();
    const to = direction === 'like' ? { x: W * 1.5, y: 40 } : direction === 'pass' ? { x: -W * 1.5, y: 40 } : { x: 0, y: -900 };
    Animated.timing(pos, { toValue: to, duration: 260, useNativeDriver: nativeDriver }).start(() => latest.current.onSwipe(card, direction));
  });
  // Re-centre only once the next card is on top, so the swiped card never flashes back.
  const topId = top?.user.id;
  useEffect(() => { pos.setValue({ x: 0, y: 0 }); busy.current = false; }, [topId, pos]);
  useImperativeHandle(ref, () => ({ swipe: flyOut }), [flyOut]);

  // Where the drag points now (a light tick in the hand when it crosses the line where letting go counts), and what letting go does.
  const [track] = useState(() => (g) => {
    const now = g ? swipeIntent({ dx: g.dx, dy: g.dy, ...latest.current.dims }) : null;
    if (now && now !== intent.current) haptic.tick();
    intent.current = now;
  });
  const [decide] = useState(() => (g) => swipeDecision({ dx: g.dx, dy: g.dy, vx: g.vx, vy: g.vy, ...latest.current.dims }));

  const [pan] = useState(() => PanResponder.create({
    // Only claim the gesture once it's clearly a drag, so taps still reach the photo and caption.
    // Capture phase, so the drag wins even though a Pressable child took the touch first.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > SWIPE.claim || Math.abs(g.dy) > SWIPE.claim,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => track(null),
    onPanResponderMove: (_, g) => {
      pos.setValue({ x: g.dx, y: g.dy });
      // A light tick in the hand the moment the drag crosses the line where letting go counts.
      track(g);
    },
    onPanResponderRelease: (_, g) => {
      const decision = decide(g);
      if (decision) return flyOut(decision);
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 7, tension: 60, useNativeDriver: nativeDriver }).start();
    },
    onPanResponderTerminate: () => Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 7, useNativeDriver: nativeDriver }).start(),
  }));

  if (!top) return null;
  const side = Math.max(SWIPE.sideMin, dims.width * SWIPE.side);
  const up = Math.max(SWIPE.upMin, dims.height * SWIPE.up);
  const rotate = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-12deg', '0deg', '12deg'] });
  const likeO = pos.x.interpolate({ inputRange: [30, side], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeO = pos.x.interpolate({ inputRange: [-side, -30], outputRange: [1, 0], extrapolate: 'clamp' });
  const superO = pos.y.interpolate({ inputRange: [-up, -30], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pos.x.interpolate({ inputRange: [-side, 0, side], outputRange: [1, 0.94, 1], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setDims({ width, height }); }}>
      {cards.slice(0, 2).reverse().map((r) => {
        const isTop = r === top;
        return (
          <Animated.View key={r.user.id} {...(isTop ? pan.panHandlers : {})}
            style={[styles.card, isTop ? { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] } : { transform: [{ scale: nextScale }] }]}>
            <Gallery user={r.user} style={StyleSheet.absoluteFill} onPressInfo={() => onOpen(r)} />
            <Shade />
            {r.match ? <Text style={[styles.badge, { right: 16 }, r.match.score >= 75 && { backgroundColor: 'rgba(34,176,125,0.92)' }]}><Ionicons name="sparkles" size={12} color="#fff" /> {tr('{score}% match', { score: r.match.score })}</Text> : null}
            {r.likes_you ? <Text style={[styles.badge, { left: 16, backgroundColor: '#ffd43b', color: '#4a3200' }]}><Ionicons name="heart" size={12} color="#4a3200" /> {tr('Likes you')}</Text> : null}
            <CardCaption r={r} onPress={() => onOpen(r)} />
            {isTop ? <>
              <Stamp label={tr('LIKE')} color={C.like} opacity={likeO} style={{ left: 22, transform: [{ rotate: '-16deg' }] }} />
              <Stamp label={tr('NOPE')} color={C.nope} opacity={nopeO} style={{ right: 22, transform: [{ rotate: '16deg' }] }} />
              <Stamp label={tr('SUPER')} color={C.super} opacity={superO} style={{ alignSelf: 'center', top: '42%', transform: [{ rotate: '-6deg' }] }} />
            </> : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...StyleSheet.absoluteFillObject, borderRadius: 28, overflow: 'hidden', backgroundColor: '#222', ...lift.lg },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  bars: { position: 'absolute', top: 10, left: 14, right: 14, flexDirection: 'row', gap: 5 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.38)' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 22, paddingBottom: 24 },
  name: { color: '#fff', fontSize: 31, fontFamily: HEADING, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  sub: { color: '#fff', opacity: 0.95, fontSize: 15, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  glass: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, fontSize: 13, fontWeight: '600', overflow: 'hidden' },
  reason: { color: '#7ee2a8', marginTop: 10, fontSize: 14, fontWeight: '600' },
  warning: { color: '#ffd8a8', marginTop: 2, fontSize: 13 },
  badge: { position: 'absolute', top: 24, backgroundColor: 'rgba(28,27,34,0.6)', color: '#fff', fontWeight: '700', fontSize: 13,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  stamp: { position: 'absolute', top: 64, borderWidth: 4, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  stampText: { fontSize: 34, fontWeight: '800', letterSpacing: 3 },
});
