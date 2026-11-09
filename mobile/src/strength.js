// How complete a profile is, and the next things worth adding. Shown on the Profile tab so people fill in more than
// the photo and bio they need to start, because fuller profiles get better matches.
import { tr } from './i18n';

/** { pct, tips: [text] } for the signed-in member's own profile. */
export function profileStrength(me) {
  if (!me || !['aupair', 'family'].includes(me.user.role)) return null;
  const u = me.user; const p = me.profile || {};
  const photos = (u.photos || []).length;
  const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '' && v !== 0);
  const items = me.user.role === 'aupair' ? [
    [12, photos >= 1, tr('Add a photo')],
    [8, photos >= 3, tr('Add at least 3 photos')],
    [12, has(p.bio), tr('Write a few words about you')],
    [6, has(p.birth_date), tr('Add your date of birth')],
    [6, has(p.nationality), tr('Add your nationality')],
    [8, has(p.languages), tr('Add the languages you speak')],
    [6, has(p.available_from), tr('Say when you can start')],
    [4, has(p.duration_months), tr('Add how long you want to stay')],
    [6, has(p.age_groups), tr('Add the ages you have looked after')],
    [6, has(p.childcare_years), tr('Add your years of childcare experience')],
    [5, has(p.skills), tr('Add your skills')],
    [5, has(p.hobbies) || has(p.traits), tr('Add your hobbies and words that describe you')],
    [4, has(p.goal) || has(p.ideal_family), tr('Describe your ideal host family')],
    [6, has(p.certificates), tr('Add a certificate, like first aid')],
    [6, !!u.verification?.id, tr('Verify your ID')],
  ] : [
    [14, photos >= 1, tr('Add a photo')],
    [8, photos >= 3, tr('Add at least 3 photos')],
    [14, has(p.bio), tr('Write a few words about your family')],
    [6, has(u.city), tr('Add your city')],
    [10, has(p.children), tr("Add your children's ages")],
    [8, has(p.start_date), tr('Add your start date')],
    [6, has(p.duration_months), tr('Add the stay length')],
    [8, has(p.weekly_hours), tr('Add the hours per week')],
    [8, has(p.pocket_money), tr('Add the pocket money')],
    [8, has(p.languages), tr('Add the languages you speak at home')],
    [10, !!u.verification?.id, tr('Verify your ID')],
  ];
  const total = items.reduce((n, [w]) => n + w, 0);
  const done = items.filter(([, ok]) => ok).reduce((n, [w]) => n + w, 0);
  // Biggest gains first.
  const tips = items.filter(([, ok]) => !ok).sort((a, b) => b[0] - a[0]).map(([, , text]) => text);
  return { pct: Math.round((done / total) * 100), tips };
}
