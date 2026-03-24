/**
 * Canonical map from demographic language labels to ISO-ish codes.
 * Used for filenames, report lookups, and the i18n layer.
 *
 * If you add a language here, also add a UI translation in src/i18n/translations.ts.
 */
export const LANGUAGE_CODES: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  Chinese: 'zh',
  Vietnamese: 'vi',
  Tagalog: 'tl',
  Korean: 'ko',
  Arabic: 'ar',
  'French/Haitian/Cajun': 'fr',
  'German/West Germanic': 'de',
  'Russian/Polish/Slavic': 'ru',
  Other: 'other',
};
