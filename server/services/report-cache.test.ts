import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildBlockCacheKey, getCachedReport, saveCachedReport, getCachedReportByKey, saveCachedReportByKey, CACHE_TTL_MS } from './report-cache.js';
import type { CommunityReport } from '../../src/types/index.js';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_CACHE_DIR = join(__dirname, '..', 'cache', 'reports');

const mockReport: CommunityReport = {
  neighborhoodName: 'Test Neighborhood',
  language: 'English',
  generatedAt: new Date().toISOString(),
  summary: 'A test summary.',
  goodNews: ['Good news 1'],
  topIssues: ['Issue 1'],
  howToParticipate: ['Action 1'],
  contactInfo: {
    councilDistrict: 'District 1',
    phone311: '311',
    anchorLocation: 'Test Library',
  },
};

describe('buildBlockCacheKey', () => {
  it('rounds lat/lng to 4 decimal places', () => {
    const key = buildBlockCacheKey(32.91553, -117.14361, 0.25, 'en');
    expect(key).toBe('addr_32.9155_-117.1436_0.25_en');
  });

  it('clamps radius to valid range', () => {
    const tooSmall = buildBlockCacheKey(32.9, -117.1, 0.01, 'en');
    expect(tooSmall).toContain('_0.1_');

    const tooLarge = buildBlockCacheKey(32.9, -117.1, 10, 'en');
    expect(tooLarge).toContain('_2_');
  });

  it('defaults NaN radius to 0.25', () => {
    const key = buildBlockCacheKey(32.9, -117.1, NaN, 'en');
    expect(key).toContain('_0.25_');
  });

  it('produces identical keys for same inputs', () => {
    const k1 = buildBlockCacheKey(32.9155, -117.1436, 0.25, 'es');
    const k2 = buildBlockCacheKey(32.9155, -117.1436, 0.25, 'es');
    expect(k1).toBe(k2);
  });

  it('produces different keys for different locations', () => {
    const k1 = buildBlockCacheKey(32.9155, -117.1436, 0.25, 'en');
    const k2 = buildBlockCacheKey(32.7157, -117.1611, 0.25, 'en');
    expect(k1).not.toBe(k2);
  });
});

describe('report-cache I/O', () => {
  const testCommunity = '__test_cache_community__';
  const testLanguage = 'English';
  const testKey = '__test_cache_key__';

  afterEach(async () => {
    // Clean up test files
    try { await rm(join(TEST_CACHE_DIR, `${testCommunity.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_english.json`)); } catch {}
    try { await rm(join(TEST_CACHE_DIR, `${testKey}.json`)); } catch {}
  });

  describe('saveCachedReport + getCachedReport', () => {
    it('saves and retrieves a community report', async () => {
      await saveCachedReport(testCommunity, testLanguage, mockReport);
      const retrieved = await getCachedReport(testCommunity, testLanguage);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.neighborhoodName).toBe(mockReport.neighborhoodName);
      expect(retrieved!.summary).toBe(mockReport.summary);
    });

    it('returns null for non-existent community', async () => {
      const result = await getCachedReport('__nonexistent__', 'English');
      expect(result).toBeNull();
    });

    it('returns null for stale reports beyond TTL', async () => {
      const staleReport = {
        ...mockReport,
        generatedAt: new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString(),
      };
      await saveCachedReport(testCommunity, testLanguage, staleReport);
      const result = await getCachedReport(testCommunity, testLanguage);
      expect(result).toBeNull();
    });
  });

  describe('saveCachedReportByKey + getCachedReportByKey', () => {
    it('saves and retrieves a report by key', async () => {
      await saveCachedReportByKey(testKey, mockReport);
      const retrieved = await getCachedReportByKey(testKey);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.neighborhoodName).toBe(mockReport.neighborhoodName);
    });

    it('returns null for non-existent key', async () => {
      const result = await getCachedReportByKey('__nonexistent_key__');
      expect(result).toBeNull();
    });

    it('returns null for stale reports beyond TTL', async () => {
      const staleReport = {
        ...mockReport,
        generatedAt: new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString(),
      };
      await saveCachedReportByKey(testKey, staleReport);
      const result = await getCachedReportByKey(testKey);
      expect(result).toBeNull();
    });
  });
});
