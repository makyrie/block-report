import { describe, it, expect } from 'vitest';
import { sanitizeStringFields, CONTROL_CHAR_RE } from './claude.js';

describe('sanitizeStringFields', () => {
  it('truncates strings to maxLen', () => {
    const result = sanitizeStringFields('a'.repeat(600));
    expect(result).toBe('a'.repeat(500));
  });

  it('strips control characters from strings', () => {
    const result = sanitizeStringFields('hello\x00world\x1f!');
    expect(result).toBe('helloworld!');
  });

  it('caps arrays to maxArrayItems', () => {
    const arr = Array.from({ length: 100 }, (_, i) => `item-${i}`);
    const result = sanitizeStringFields(arr) as string[];
    expect(result).toHaveLength(50); // default
  });

  it('respects custom maxArrayItems', () => {
    const arr = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const result = sanitizeStringFields(arr, undefined, undefined, { maxArrayItems: 5 }) as string[];
    expect(result).toHaveLength(5);
  });

  it('respects custom maxStringLen', () => {
    const result = sanitizeStringFields('a'.repeat(3000), undefined, undefined, { maxStringLen: 2000 });
    expect(result).toBe('a'.repeat(2000));
  });

  it('throws on deeply nested objects beyond maxDepth', () => {
    // Build a 15-level deep object
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 15; i++) {
      obj = { nested: obj };
    }
    expect(() => sanitizeStringFields(obj)).toThrow(/too deep/);
  });

  it('does not throw on objects within maxDepth', () => {
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 8; i++) {
      obj = { nested: obj };
    }
    expect(() => sanitizeStringFields(obj)).not.toThrow();
  });

  it('throws on objects with too many keys', () => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < 101; i++) {
      obj[`key${i}`] = 'value';
    }
    expect(() => sanitizeStringFields(obj)).toThrow(/too many keys/);
  });

  it('passes through numbers and booleans unchanged', () => {
    expect(sanitizeStringFields(42)).toBe(42);
    expect(sanitizeStringFields(true)).toBe(true);
    expect(sanitizeStringFields(null)).toBe(null);
  });

  it('recursively sanitizes nested objects', () => {
    const input = {
      name: 'test\x00name',
      details: {
        description: 'x'.repeat(600),
        items: ['a', 'b'],
      },
    };
    const result = sanitizeStringFields(input) as Record<string, unknown>;
    expect((result as { name: string }).name).toBe('testname');
    const details = result.details as { description: string; items: string[] };
    expect(details.description).toBe('x'.repeat(500));
    expect(details.items).toEqual(['a', 'b']);
  });
});

describe('CONTROL_CHAR_RE', () => {
  it('matches null byte', () => {
    expect('hello\x00world'.replace(CONTROL_CHAR_RE, '')).toBe('helloworld');
  });

  it('matches DEL character', () => {
    expect('hello\x7fworld'.replace(CONTROL_CHAR_RE, '')).toBe('helloworld');
  });

  it('does not match printable characters', () => {
    const clean = 'Hello, World! 123';
    expect(clean.replace(CONTROL_CHAR_RE, '')).toBe(clean);
  });
});
