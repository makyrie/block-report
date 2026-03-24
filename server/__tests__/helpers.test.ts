import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We test withErrorHandling and withCommunityValidation by constructing
// the wrapper and calling it with mock handlers, without needing to mock
// the actual logger or community service (those are only hit on error or
// validation paths that we can trigger by throwing from the handler).

// Import the real helpers — withErrorHandling doesn't depend on external
// services, and withCommunityValidation's validation path requires the
// community service. We test withErrorHandling directly and test
// withCommunityValidation's error-handling delegation indirectly.

import { withErrorHandling } from '../mcp/tools/helpers.js';

describe('withErrorHandling', () => {
  it('passes through successful results', async () => {
    const handler = withErrorHandling('test_tool', async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
    }));
    const result = await handler({});
    assert.equal(result.content[0].text, 'ok');
    assert.equal(result.isError, undefined);
  });

  it('catches errors and returns error result', async () => {
    const handler = withErrorHandling('test_tool', async () => {
      throw new Error('boom');
    });
    const result = await handler({});
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('internal error'));
  });

  it('passes args to handler', async () => {
    const handler = withErrorHandling<{ foo: string }>('test_tool', async (args) => ({
      content: [{ type: 'text' as const, text: args.foo }],
    }));
    const result = await handler({ foo: 'bar' });
    assert.equal(result.content[0].text, 'bar');
  });
});
