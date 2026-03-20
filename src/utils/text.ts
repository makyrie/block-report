/** Truncate text to roughly N sentences. */
export function truncateSentences(text: string, max: number): string {
  const sentences = text.match(/[^.!?\u3002\uff01\uff1f]+[.!?\u3002\uff01\uff1f]+/g);
  if (!sentences || sentences.length <= max) return text;
  return sentences.slice(0, max).join('').trim();
}
