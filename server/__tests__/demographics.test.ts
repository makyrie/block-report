import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTopLanguages } from '../services/demographics.js';

describe('computeTopLanguages', () => {
  it('returns empty array for no rows', () => {
    assert.deepEqual(computeTopLanguages([]), []);
  });

  it('returns empty array when total_pop_5plus is 0', () => {
    const rows = [{ total_pop_5plus: 0, english_only: 0, spanish: 0 }];
    assert.deepEqual(computeTopLanguages(rows), []);
  });

  it('computes percentages and sorts descending', () => {
    const rows = [{
      total_pop_5plus: 1000,
      english_only: 600,
      spanish: 300,
      chinese: 50,
      vietnamese: 50,
      tagalog: 0,
      korean: 0,
      arabic: 0,
      french_haitian_cajun: 0,
      german_west_germanic: 0,
      russian_polish_slavic: 0,
      other_unspecified: 0,
    }];
    const result = computeTopLanguages(rows);
    assert.equal(result[0].language, 'English');
    assert.equal(result[0].percentage, 60);
    assert.equal(result[1].language, 'Spanish');
    assert.equal(result[1].percentage, 30);
    // Zero-percentage languages should be filtered out
    assert.ok(result.every((l) => l.percentage > 0));
  });

  it('aggregates across multiple rows', () => {
    const rows = [
      { total_pop_5plus: 500, english_only: 400, spanish: 100 },
      { total_pop_5plus: 500, english_only: 200, spanish: 300 },
    ];
    const result = computeTopLanguages(rows);
    assert.equal(result[0].language, 'English');
    assert.equal(result[0].percentage, 60); // 600/1000
    assert.equal(result[1].language, 'Spanish');
    assert.equal(result[1].percentage, 40); // 400/1000
  });
});
