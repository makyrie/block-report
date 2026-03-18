// Shared language codes and filename sanitization

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
};

export const VALID_LANGUAGES = new Set(Object.keys(LANGUAGE_CODES));

export function getLangCode(language: string): string {
  return LANGUAGE_CODES[language] || language.toLowerCase().slice(0, 2);
}

export function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
