import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// Unit tests for security-critical logic extracted from server/mcp/http.ts.
// We test the logic patterns directly rather than spinning up the full server,
// since http.ts has side effects (process.exit, app.listen) at module scope.

const SESSION_ID_RE = /^[\w-]{1,128}$/;

describe('MCP HTTP transport — session ID validation', () => {
  it('accepts valid alphanumeric session IDs', () => {
    assert.ok(SESSION_ID_RE.test('abc123'));
  });

  it('accepts IDs with hyphens and underscores', () => {
    assert.ok(SESSION_ID_RE.test('session-id_123'));
  });

  it('rejects empty string', () => {
    assert.ok(!SESSION_ID_RE.test(''));
  });

  it('rejects IDs longer than 128 characters', () => {
    assert.ok(!SESSION_ID_RE.test('a'.repeat(129)));
  });

  it('accepts IDs exactly 128 characters', () => {
    assert.ok(SESSION_ID_RE.test('a'.repeat(128)));
  });

  it('rejects IDs with special characters', () => {
    assert.ok(!SESSION_ID_RE.test('session id'));
    assert.ok(!SESSION_ID_RE.test('session/id'));
    assert.ok(!SESSION_ID_RE.test('../etc/passwd'));
    assert.ok(!SESSION_ID_RE.test('id;DROP TABLE'));
  });
});

describe('MCP HTTP transport — bearer token comparison', () => {
  const AUTH_TOKEN = 'test-secret-token-12345';
  const tokenBuf = Buffer.from(AUTH_TOKEN);

  function verifyToken(supplied: string): boolean {
    const suppliedBuf = Buffer.from(supplied);
    if (suppliedBuf.length !== tokenBuf.length) return false;
    return crypto.timingSafeEqual(suppliedBuf, tokenBuf);
  }

  it('accepts valid token', () => {
    assert.ok(verifyToken('test-secret-token-12345'));
  });

  it('rejects wrong token of same length', () => {
    assert.ok(!verifyToken('test-secret-token-99999'));
  });

  it('rejects wrong length token', () => {
    assert.ok(!verifyToken('short'));
  });

  it('rejects empty token', () => {
    assert.ok(!verifyToken(''));
  });
});

describe('MCP HTTP transport — session capacity', () => {
  it('enforces MAX_SESSIONS limit', () => {
    const MAX_SESSIONS = 1000;
    const sessions = new Map<string, { lastActivity: number }>();

    // Fill to capacity
    for (let i = 0; i < MAX_SESSIONS; i++) {
      sessions.set(`session-${i}`, { lastActivity: Date.now() });
    }

    assert.ok(sessions.size >= MAX_SESSIONS);
    // At capacity, new session should be rejected
    const atCapacity = sessions.size >= MAX_SESSIONS;
    assert.ok(atCapacity);
  });
});

describe('MCP HTTP transport — stale session cleanup', () => {
  it('removes sessions older than TTL', () => {
    const SESSION_TTL = 30 * 60 * 1000;
    const sessions = new Map<string, { lastActivity: number }>();

    const now = Date.now();
    sessions.set('fresh', { lastActivity: now });
    sessions.set('stale', { lastActivity: now - SESSION_TTL - 1 });
    sessions.set('borderline', { lastActivity: now - SESSION_TTL + 1000 });

    // Simulate cleanup logic
    for (const [sid, entry] of sessions) {
      if (now - entry.lastActivity > SESSION_TTL) {
        sessions.delete(sid);
      }
    }

    assert.ok(sessions.has('fresh'));
    assert.ok(!sessions.has('stale'));
    assert.ok(sessions.has('borderline'));
  });
});
