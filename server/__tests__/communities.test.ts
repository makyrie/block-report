import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCommunityName } from '../services/communities.js';

describe('normalizeCommunityName', () => {
  it('uppercases input', () => {
    assert.equal(normalizeCommunityName('mira mesa'), 'MIRA MESA');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeCommunityName('  Barrio Logan  '), 'BARRIO LOGAN');
  });

  it('strips SQL wildcard characters', () => {
    assert.equal(normalizeCommunityName('MIRA%MESA'), 'MIRAMESA');
    assert.equal(normalizeCommunityName('MIRA_MESA'), 'MIRAMESA');
  });

  it('handles empty string', () => {
    assert.equal(normalizeCommunityName(''), '');
  });

  it('preserves hyphens and spaces', () => {
    assert.equal(normalizeCommunityName('mid-city'), 'MID-CITY');
  });
});
