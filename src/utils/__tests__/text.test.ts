import { describe, it, expect } from 'vitest';
import { truncateSentences } from '../text.js';

describe('truncateSentences', () => {
  it('should return full text when under the limit', () => {
    expect(truncateSentences('One sentence.', 3)).toBe('One sentence.');
  });

  it('should truncate to the specified number of sentences', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    expect(truncateSentences(text, 2)).toBe('First sentence. Second sentence.');
  });

  it('should handle text with different punctuation marks', () => {
    const text = 'Is this a question? Yes it is! And a statement.';
    expect(truncateSentences(text, 2)).toBe('Is this a question? Yes it is!');
  });

  it('should return original text when no sentence-ending punctuation', () => {
    expect(truncateSentences('No punctuation here', 2)).toBe('No punctuation here');
  });

  it('should handle empty string', () => {
    expect(truncateSentences('', 2)).toBe('');
  });

  it('should handle single sentence', () => {
    expect(truncateSentences('Just one.', 1)).toBe('Just one.');
  });

  it('should handle exclamation marks', () => {
    const text = 'Wow! Amazing! Great!';
    expect(truncateSentences(text, 1)).toBe('Wow!');
  });
});
