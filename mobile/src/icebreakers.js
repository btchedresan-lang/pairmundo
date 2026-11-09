// Conversation starters for a new match's empty chat, drawn from the other person's profile, so the first message is
// easy to write and about them. Tapping one puts it in the message box to edit before sending.
import { country, firstName, HOBBIES, langName, SKILLS } from './data';
import { getLang, tr } from './i18n';

// German nouns keep their capital letter mid-sentence.
const low = (s) => (getLang() === 'de' ? s : String(s).toLowerCase());

/** Up to three openers for messaging `other` (with their public profile) as a family or an au pair. */
export function icebreakers(myRole, other, profile = {}) {
  const name = firstName(other?.name) || '';
  const out = [];
  if (myRole === 'family') {
    out.push(tr('Hi {name}! We loved your profile. What made you want to be an au pair?', { name }));
    const hobby = (profile.hobbies || []).find((h) => HOBBIES[h]);
    if (hobby) out.push(tr('We saw you like {hobby}. Our kids would love that! What do you enjoy most about it?', { hobby: low(tr(HOBBIES[hobby][1])) }));
    const skill = (profile.skills || []).find((k) => SKILLS[k]);
    if (skill) out.push(tr('Could you tell us about your experience with {skill}?', { skill: low(tr(SKILLS[skill])) }));
    const lang = (profile.languages || []).find((l) => l.code && l.code !== 'en');
    if (lang && out.length < 3) out.push(tr('Would you be happy to speak {language} with our children?', { language: langName(lang.code) }));
    if (out.length < 3) out.push(tr('What does a perfect day with children look like for you?'));
    if (out.length < 3 && profile.available_from) out.push(tr('When would you ideally like to start?'));
  } else {
    const where = other?.city || country(other?.country);
    // Family names read oddly in a greeting ("Hi The Smith F."), so these start with a plain hello.
    out.push(where ? tr('Hi! I would love to hear more about your family and life in {place}.', { place: where })
      : tr('Hi! I would love to hear more about your family.'));
    const kids = (profile.children || []).map((c) => c.age).filter((a) => a != null);
    if (kids.length) out.push(tr('What do your children like to do after school or at weekends?'));
    out.push(tr('What would a normal week look like for your au pair?'));
    if (profile.has_pets && out.length < 3) out.push(tr('I saw you have pets. What are they like?'));
    if (out.length < 3) out.push(tr('What are you hoping for in an au pair?'));
  }
  return out.slice(0, 3);
}
