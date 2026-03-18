const REFERRED_RE = /referred/i;

export function classifyStatus(status: string | null, dateClosed: Date | null): 'open' | 'resolved' | 'referred' {
  if (status === 'Closed' || !!dateClosed) return 'resolved';
  if (REFERRED_RE.test(status || '')) return 'referred';
  return 'open';
}
