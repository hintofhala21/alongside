import french from './locales/fr.json' with { type: 'json' };
import spanish from './locales/es.json' with { type: 'json' };

export const languagePacks = {fr: french, es: spanish};

export function supportedLanguage(requested) {
  const base = typeof requested === 'string' ? requested.toLowerCase().split('-')[0] : 'en';
  return base === 'ar' || Object.hasOwn(languagePacks, base) ? base : 'en';
}
