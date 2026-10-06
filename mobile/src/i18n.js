// The app's languages. Screens write their text in English and wrap it in tr(); each file in ./locales maps that
// English text to a translation. Text that isn't translated yet shows in English. `npm run i18n` lists what's missing.
import { createContext, useContext, useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { store } from './storage';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';

/** Each language in its own name, as shown in the language switch. */
export const LANGUAGES = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' };
const DICTS = { de, es, fr, pt };

const phoneLang = () => {
  try { return getLocales().map((l) => l.languageCode).find((c) => c in LANGUAGES) || 'en'; } catch { return 'en'; }
};
let lang = phoneLang();
export const getLang = () => lang;

/** Translate English text. `{name}` placeholders are filled from vars: tr('Block {name}?', { name }). */
export function tr(text, vars) {
  const s = DICTS[lang]?.[text] || text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
/** Pick the singular or plural text by count; the count is available as {n}. */
export const trn = (n, one, other, vars) => tr(n === 1 ? one : other, { n, ...vars });
/** Translate every label in a { key: 'English label' } map. */
export const trMap = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, tr(v)]));

const LangContext = createContext(null);

/** Loads the saved language (or follows the phone's) and redraws the app when it changes. */
export function LanguageProvider({ children }) {
  const [state, setState] = useState(null);
  const apply = (choice) => {
    const picked = choice in LANGUAGES ? choice : null;
    lang = picked || phoneLang();
    setState({ lang, choice: picked });
  };
  useEffect(() => { store.get('lang').then(apply, () => apply(null)); }, []);
  if (!state) return null;
  const setLanguage = async (choice) => {
    if (choice) await store.set('lang', choice); else await store.del('lang');
    apply(choice);
  };
  return <LangContext.Provider value={{ ...state, setLanguage }}>{children}</LangContext.Provider>;
}

export const useLanguage = () => useContext(LangContext);
