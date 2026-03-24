import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTravelTime } from '../services/transit.js';

describe('formatTravelTime', () => {
  it('formats minutes', () => {
    assert.equal(formatTravelTime(45), '~45 min');
  });

  it('returns null for null input', () => {
    assert.equal(formatTravelTime(null), null);
  });

  it('formats zero', () => {
    assert.equal(formatTravelTime(0), '~0 min');
  });
});
