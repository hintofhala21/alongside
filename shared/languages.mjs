import ar from './locales/ar.json' with {type: 'json'};
import de from './locales/de.json' with {type: 'json'};
import es from './locales/es.json' with {type: 'json'};
import fr from './locales/fr.json' with {type: 'json'};
import hi from './locales/hi.json' with {type: 'json'};
import ja from './locales/ja.json' with {type: 'json'};
import pt from './locales/pt.json' with {type: 'json'};
import zh from './locales/zh.json' with {type: 'json'};

export const languagePacks = { ar, de, es, fr, hi, ja, pt, zh };
export const languageNames = {
  en: 'English', ar: 'العربية الفصحى', zh: '简体中文（普通话）', es: 'Español',
  fr: 'Français', hi: 'हिन्दी', pt: 'Português (Brasil)', de: 'Deutsch', ja: '日本語'
};

export function supportedLanguage(requested) {
  try {
    const base = new Intl.Locale(requested).language;
    return Object.hasOwn(languageNames, base) ? base : 'en';
  } catch { return 'en'; }
}
