import { describe, it, expect } from 'vitest';
import translations, { SUPPORTED_LANGUAGES } from './translations';

describe('i18n translations', () => {
  const englishKeys = Object.keys(translations.en).sort();
  const languageCodes = SUPPORTED_LANGUAGES.map((l) => l.code);

  it('has translations for all supported languages', () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      expect(translations).toHaveProperty(code);
    }
  });

  for (const code of languageCodes) {
    if (code === 'en') continue;
    it(`${code} has all keys present in English`, () => {
      const langKeys = Object.keys(translations[code]).sort();
      const missing = englishKeys.filter((k) => !langKeys.includes(k));
      expect(missing).toEqual([]);
    });
  }

  it('no language has extra keys not in English', () => {
    for (const code of languageCodes) {
      if (code === 'en') continue;
      const langKeys = Object.keys(translations[code]);
      const extra = langKeys.filter((k) => !englishKeys.includes(k));
      expect(extra).toEqual([]);
    }
  });
});
