import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { C } from '../theme';
import { country, fmtDate, flag, langName } from '../data';
import { tr, trn } from '../i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { imageUrl } from '../api';
import { Photo } from './ui';

const W = Dimensions.get('window').width;
const THRESHOLD = 110;
const nativeDriver = Platform.OS !== 'web';

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
  const langs = (p.languages || []).map((l) => langName(u.role === 'aupair' ? l.code : l));
  const sub = u.role === 'aupair'
    ? [p.childcare_years ? tr('{n} yrs childcare', { n: p.childcare_years }) : '', p.available_from ? tr('from {date}', { date: fmtDate(p.available_from) }) : ''].filter(Boolean).join(' · ')
    : [kids, p.start_date ? tr('starts {date}', { date: fmtDate(p.start_date) }) : ''].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} style={styles.caption}>
      <Text style={styles.name} numberOfLines={2}>{u.name}{age ? <Text style={{ fontWeight: '400' }}>  {age}</Text> : null}{u.verification?.id ? '  ✔' : ''}</Text>
      <Text style={styles.sub}>{flag(u.country)} {[u.city, country(u.country)].filter(Boolean).join(', ')}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {langs.slice(0, 3).map((l) => <Text key={l} style={styles.glass}>{l}</Text>)}
        {r.rating?.avg ? <Text style={styles.glass}>★ {r.rating.avg}</Text> : null}
        {u.role === 'aupair' && p.drivers_license ? <Text style={styles.glass}>🚗 {tr('Driver')}</Text> : null}
      </View>
      {r.match?.reasons?.length ? <Text style={styles.reason}>✓ {tr(r.match.reasons[0])}</Text> : null}
      {r.match?.warnings?.length ? <Text style={styles.warning}>⚠ {tr(r.match.warnings[0])}</Text> : null}
    </Pressable>
  );
}

export const Shade = () => <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.88)']} locations={[0, 0.45, 1]} style={styles.shade} />;

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
  // Gesture handlers are created once, so they read the current cards and callback from here.
  const latest = useRef({ cards, onSwipe });
  useEffect(() => { latest.current = { cards, onSwipe }; });
  const top = cards[0];

  const [flyOut] = useState(() => (direction) => {
    const card = latest.current.cards[0];
    if (busy.current || !card) return;
    busy.current = true;
    const to = direction === 'like' ? { x: W * 1.5, y: 40 } : direction === 'pass' ? { x: -W * 1.5, y: 40 } : { x: 0, y: -900 };
    Animated.timing(pos, { toValue: to, duration: 260, useNativeDriver: nativeDriver }).start(() => latest.current.onSwipe(card, direction));
  });
  // Re-centre only once the next card is on top, so the swiped card never flashes back.
  const topId = top?.user.id;
  useEffect(() => { pos.setValue({ x: 0, y: 0 }); busy.current = false; }, [topId, pos]);
  useImperativeHandle(ref, () => ({ swipe: flyOut }), [flyOut]);

  const [pan] = useState(() => PanResponder.create({
    // Only claim the gesture once it's clearly a drag, so taps still reach the photo and caption.
    // Capture phase, so the drag wins even though a Pressable child took the touch first.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      if (g.dx > THRESHOLD) return flyOut('like');
      if (g.dx < -THRESHOLD) return flyOut('pass');
      if (g.dy < -THRESHOLD * 1.2 && Math.abs(g.dx) < 80) return flyOut('super');
      Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: nativeDriver }).start();
    },
    onPanResponderTerminate: () => Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: nativeDriver }).start(),
  }));

  if (!top) return null;
  const rotate = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-18deg', '0deg', '18deg'] });
  const likeO = pos.x.interpolate({ inputRange: [0, 100], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeO = pos.x.interpolate({ inputRange: [-100, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const superO = pos.y.interpolate({ inputRange: [-120, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pos.x.interpolate({ inputRange: [-W, 0, W], outputRange: [1, 0.95, 1], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1 }}>
      {cards.slice(0, 2).reverse().map((r) => {
        const isTop = r === top;
        return (
          <Animated.View key={r.user.id} {...(isTop ? pan.panHandlers : {})}
            style={[styles.card, isTop ? { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] } : { transform: [{ scale: nextScale }] }]}>
            <Gallery user={r.user} style={StyleSheet.absoluteFill} onPressInfo={() => onOpen(r)} />
            <Shade />
            {r.match ? <Text style={[styles.badge, { right: 14 }, r.match.score >= 75 && { backgroundColor: C.like }]}>{tr('{score}% match', { score: r.match.score })}</Text> : null}
            {r.likes_you ? <Text style={[styles.badge, { left: 14, backgroundColor: '#ffd43b', color: '#5c3c00' }]}>💛 {tr('Likes you')}</Text> : null}
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
  card: { ...StyleSheet.absoluteFillObject, borderRadius: 22, overflow: 'hidden', backgroundColor: '#222',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  bars: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18 },
  name: { color: '#fff', fontSize: 28, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  sub: { color: '#fff', opacity: 0.95, fontSize: 15, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  glass: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 13, overflow: 'hidden' },
  reason: { color: '#8ce99a', marginTop: 8, fontSize: 14 },
  warning: { color: '#ffd8a8', marginTop: 2, fontSize: 13 },
  badge: { position: 'absolute', top: 22, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: '700', fontSize: 13,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  stamp: { position: 'absolute', top: 60, borderWidth: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 2 },
  stampText: { fontSize: 38, fontWeight: '900', letterSpacing: 2 },
});
