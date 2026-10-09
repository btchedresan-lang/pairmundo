// The au pair profile laid out like the "Hi, I'm ..." letters au pairs make for host families: a polaroid photo and
// pastel cards for each part of the profile. Cards with nothing filled in are left out.
import { View } from 'react-native';
import { HEADING, HEADING_BOLD, Text } from './Text';
import { Photo, Stars } from './ui';
import { Gallery } from './SwipeDeck';
import { AGE_GROUPS, CERTS, cname, country, firstName, flag, fmtDate, HOBBIES, langName, SKILLS, TRAITS } from '../data';
import { tr, trn } from '../i18n';
import { C, useTheme } from '../theme';

// [card background, header strip, accent].
const TINTS = {
  green: ['#eef8f1', '#d6f0df', '#2f9e5b'], peach: ['#fdf1ea', '#fadbc8', '#e0703a'], blue: ['#edf3fd', '#d6e4fb', '#3b6fd8'],
  teal: ['#e9f7f6', '#cfeeeb', '#1f9a92'], pink: ['#fdeff2', '#f8d6de', '#d6456b'], lilac: ['#f4eefc', '#e4d8f7', '#8456d0'],
  yellow: ['#fdf7e4', '#f8e8b0', '#b8860b'],
};

function useTint(name) {
  const [bg, head, accent] = TINTS[name];
  return { bg, head, accent };
}

function Section({ tint, icon, title, children, tilt = 0 }) {
  const t = useTheme();
  const c = useTint(tint);
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 18, overflow: 'hidden', transform: [{ rotate: `${tilt}deg` }] }}>
      <View style={{ backgroundColor: c.head, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
        <Text style={{ fontFamily: HEADING_BOLD, fontSize: 19, color: t.ink, letterSpacing: 0.3 }}>{title}</Text>
      </View>
      <View style={{ padding: 16, gap: 9 }}>{children}</View>
    </View>
  );
}

function Row({ icon, children }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Text style={{ fontSize: 17, width: 24, textAlign: 'center' }}>{icon}</Text>
      <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

const Para = ({ children }) => { const t = useTheme(); return <Text style={{ color: t.ink, fontSize: 15, lineHeight: 22 }}>{children}</Text>; };

function Polaroid({ user, uri, width, tilt, caption, gallery }) {
  return (
    <View style={{ backgroundColor: '#fff', padding: 8, paddingBottom: caption ? 6 : 8, borderRadius: 4, transform: [{ rotate: `${tilt}deg` }],
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
      {gallery ? <Gallery user={user} style={{ width, height: width * 4 / 3 }} />
        : <Photo user={user} uri={uri} style={{ width, height: width * 4 / 3 }} />}
      {caption ? <Text style={{ textAlign: 'center', color: '#475066', fontFamily: HEADING, fontSize: 14, marginTop: 6 }} numberOfLines={1}>{caption}</Text> : null}
    </View>
  );
}

/** Name, "Au pair from ..." and the photo. Tapping the photo flips through all photos. */
export function PosterHeader({ u, p, width, badge }) {
  const t = useTheme();
  const from = p.nationality || u.country;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 14 }}>
      <View>
        <Text style={{ fontFamily: HEADING_BOLD, fontSize: 40, color: t.ink, lineHeight: 46 }}>{tr('Hi!')}</Text>
        <Text style={{ fontFamily: HEADING_BOLD, fontSize: 32, color: t.ink, lineHeight: 38 }}>
          {tr("I'm {name}", { name: firstName(u.name) })}{u.verification?.id ? <Text style={{ color: C.primary, fontSize: 24 }}>  ✔</Text> : null}
        </Text>
        {from ? (
          <View style={{ alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#f8d6de', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, transform: [{ rotate: '-2deg' }] }}>
            <Text style={{ fontFamily: HEADING, fontSize: 18, color: '#5c2233' }}>{tr('Au pair from {country}', { country: country(from) })} {flag(from)}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Polaroid user={u} gallery width={width - 80} tilt={1.5} caption={tr('Big dreams · Good vibes · New adventures')} />
        {badge}
      </View>
    </View>
  );
}

/** Everything below the photo. */
export function PosterBody({ u, p, refs = [] }) {
  const t = useTheme();
  const place = [u.city, country(u.country)].filter(Boolean).join(', ');
  const traits = (p.traits || []).map((k) => (TRAITS[k] ? tr(TRAITS[k]) : k));
  const hobbies = (p.hobbies || []).filter((k) => HOBBIES[k]);
  const extra = (u.photos || []).slice(1, 4);
  const months = p.duration_months && trn(p.duration_months, '{n} month', '{n} months');
  const certs = (p.certificates || []).filter((c) => CERTS[c.kind]);
  const goodToKnow = [p.drivers_license && ['🚗', tr("Has a driver's license")], p.non_smoker && ['🚭', tr('Non-smoker')], p.ok_with_pets && ['🐾', tr('Happy to live with pets')]].filter(Boolean);

  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Section tint="green" icon="🙂" title={tr('About me')}>
        {p.age ? <Row icon="🎂">{trn(p.age, '{n} year old', '{n} years old')}</Row> : null}
        {p.nationality ? <Row icon={flag(p.nationality) || '🌍'}>{tr('From {country}', { country: country(p.nationality) })}</Row> : null}
        {place ? <Row icon="📍">{tr('Currently in {place}', { place })}</Row> : null}
        {traits.length ? <Row icon="♡">{traits.join(' · ')}</Row> : null}
        {p.bio ? <Para>{p.bio}</Para> : null}
      </Section>

      {p.childcare_years || p.age_groups?.length || p.skills?.length ? (
        <Section tint="peach" icon="🧸" title={tr('My experience with children')} tilt={-0.4}>
          {p.childcare_years ? <Row icon="⭐">{trn(p.childcare_years, '{n} year of childcare experience', '{n} years of childcare experience')}</Row> : null}
          {(p.age_groups || []).map((g) => <Row key={g} icon="👶">{AGE_GROUPS[g] ? tr(AGE_GROUPS[g]) : g}</Row>)}
          {p.skills?.length ? <>
            <Text style={{ color: t.ink, fontWeight: '700', marginTop: 4 }}>{tr('I can help with:')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
              {p.skills.map((s) => <Text key={s} style={{ width: '50%', color: t.ink, fontSize: 15 }}>• {SKILLS[s] ? tr(SKILLS[s]) : s}</Text>)}
            </View>
          </> : null}
        </Section>
      ) : null}

      {p.languages?.length ? (
        <Section tint="yellow" icon="🗣️" title={tr('Languages')} tilt={0.3}>
          {p.languages.map((l) => <Row key={l.code} icon="💬">{langName(l.code)} · {l.level === 'native' ? tr('native') : l.level}</Row>)}
        </Section>
      ) : null}

      {certs.length ? (
        <Section tint="green" icon="🎓" title={tr('My certificates')} tilt={-0.3}>
          {certs.map((c) => <Row key={c.kind} icon={CERTS[c.kind][0]}>{tr(CERTS[c.kind][1])}{c.detail ? ` · ${c.detail}` : ''}</Row>)}
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr('Added by {name}. Ask to see them on your video call.', { name: firstName(u.name) })}</Text>
        </Section>
      ) : null}

      {refs.length ? (
        <Section tint="peach" icon="💌" title={tr('References')} tilt={0.3}>
          {refs.map((r) => (
            <View key={r.id} style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: t.ink, fontWeight: '700', flex: 1 }}>{r.name}{r.relation ? <Text style={{ fontWeight: '400', color: t.muted }}> · {r.relation}</Text> : null}</Text>
                <Stars value={r.rating} size={13} />
              </View>
              <Text style={{ color: t.muted, fontSize: 13 }}>{[trn(r.months, '{n} month', '{n} months'), ...(r.age_groups || []).map((g) => (AGE_GROUPS[g] ? tr(AGE_GROUPS[g]) : g)), r.recommend ? `👍 ${tr('Recommends {name}', { name: firstName(u.name) })}` : ''].filter(Boolean).join(' · ')}</Text>
              {r.comment ? <Para>“{r.comment}”</Para> : null}
            </View>
          ))}
          <Text style={{ color: t.muted, fontSize: 13 }}>{tr('PairMundo emailed these people and they answered themselves.')}</Text>
        </Section>
      ) : null}

      {goodToKnow.length ? (
        <Section tint="blue" icon="✨" title={tr('Good to know')}>
          {goodToKnow.map(([i, s]) => <Row key={s} icon={i}>{s}</Row>)}
        </Section>
      ) : null}

      {hobbies.length ? (
        <Section tint="teal" icon="🌿" title={tr('Hobbies and personality')} tilt={-0.3}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 9 }}>
            {hobbies.map((k) => <View key={k} style={{ width: '50%' }}><Row icon={HOBBIES[k][0]}>{tr(HOBBIES[k][1])}</Row></View>)}
          </View>
        </Section>
      ) : null}

      {p.goal || p.preferred_countries?.length ? (
        <Section tint="pink" icon="🎯" title={tr('My goal')}>
          {p.goal ? <Para>{p.goal}</Para> : null}
          {p.preferred_countries?.length ? <Row icon="🌍">{tr('Would love to go to {places}', { places: p.preferred_countries.map(cname).join(', ') })}</Row> : null}
        </Section>
      ) : null}

      {p.ideal_family ? (
        <Section tint="lilac" icon="🏡" title={tr('My ideal family')} tilt={0.3}>
          <Para>{p.ideal_family}</Para>
        </Section>
      ) : null}

      {p.available_from || months ? (
        <Section tint="yellow" icon="📅" title={tr('Available')}>
          {p.available_from ? <Row icon="🗓️">{tr('From {date}', { date: fmtDate(p.available_from) })}</Row> : null}
          {months ? <Row icon="⏳">{tr('For {stay}', { stay: months })}</Row> : null}
        </Section>
      ) : null}

      {extra.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 8 }}>
          {extra.map((uri, i) => <Polaroid key={uri} user={u} uri={uri} width={92} tilt={[-4, 3, -2][i]} />)}
        </View>
      ) : null}

      <View style={{ alignItems: 'center', paddingVertical: 6, transform: [{ rotate: '-1.5deg' }] }}>
        <Text style={{ fontFamily: HEADING_BOLD, fontSize: 24, color: t.ink, textAlign: 'center' }}>{tr('Looking for my next host family!')} ♡</Text>
        <Text style={{ fontFamily: HEADING, fontSize: 16, color: t.muted, textAlign: 'center', marginTop: 4 }}>{tr('Like my profile if you think we could be a good match.')}</Text>
      </View>
    </View>
  );
}
