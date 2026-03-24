import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock communities module before importing the module under test
mock.module('../services/communities.js', {
  namedExports: {
    validateCommunityName: async (input: string) => {
      const normalized = input.toUpperCase().trim();
      const validNames = ['MIRA MESA', 'BARRIO LOGAN', 'LA JOLLA', 'OCEAN BEACH', 'PACIFIC BEACH'];
      return {
        valid: validNames.includes(normalized),
        normalized,
        names: validNames,
      };
    },
  },
});

const { parseAndValidateCommunity } = await import('../routes/validate-community.js');
const { withCommunityValidation, validateOptionalCommunity } = await import('../mcp/tools/helpers.js');

function mockRes() {
  let statusCode = 200;
  let body: unknown = null;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      body = data;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

describe('parseAndValidateCommunity', () => {
  it('returns 400 for missing community param', async () => {
    const req = { query: {} } as any;
    const res = mockRes();
    const result = await parseAndValidateCommunity(req, res as any);
    assert.equal(result, null);
    assert.equal(res.getStatus(), 400);
  });

  it('returns 400 for empty community param', async () => {
    const req = { query: { community: '   ' } } as any;
    const res = mockRes();
    const result = await parseAndValidateCommunity(req, res as any);
    assert.equal(result, null);
    assert.equal(res.getStatus(), 400);
  });

  it('returns 400 for too-long community param', async () => {
    const req = { query: { community: 'a'.repeat(101) } } as any;
    const res = mockRes();
    const result = await parseAndValidateCommunity(req, res as any);
    assert.equal(result, null);
    assert.equal(res.getStatus(), 400);
  });

  it('returns 404 for unknown community', async () => {
    const req = { query: { community: 'UNKNOWN PLACE' } } as any;
    const res = mockRes();
    const result = await parseAndValidateCommunity(req, res as any);
    assert.equal(result, null);
    assert.equal(res.getStatus(), 404);
  });

  it('returns normalized name for valid community', async () => {
    const req = { query: { community: 'mira mesa' } } as any;
    const res = mockRes();
    const result = await parseAndValidateCommunity(req, res as any);
    assert.equal(result, 'MIRA MESA');
  });
});

describe('withCommunityValidation', () => {
  it('returns error with suggestions for invalid community', async () => {
    const handler = withCommunityValidation('test', async (normalized) => ({
      content: [{ type: 'text' as const, text: normalized }],
    }));
    const result = await handler({ community_name: 'NOWHERE' });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('Did you mean'));
  });

  it('passes normalized name to handler for valid community', async () => {
    const handler = withCommunityValidation('test', async (normalized) => ({
      content: [{ type: 'text' as const, text: normalized }],
    }));
    const result = await handler({ community_name: 'mira mesa' });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, 'MIRA MESA');
  });
});

describe('validateOptionalCommunity', () => {
  it('returns undefined normalized for empty input', async () => {
    const result = await validateOptionalCommunity(undefined);
    assert.equal(result.normalized, undefined);
    assert.equal(result.error, undefined);
  });

  it('returns error for invalid community', async () => {
    const result = await validateOptionalCommunity('NOWHERE');
    assert.ok(result.error);
    assert.equal(result.error!.isError, true);
  });

  it('returns normalized name for valid community', async () => {
    const result = await validateOptionalCommunity('la jolla');
    assert.equal(result.normalized, 'LA JOLLA');
    assert.equal(result.error, undefined);
  });
});
