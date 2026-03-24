import { describe, it, expect } from 'vitest';
import { classifyStatus } from '../status.js';

describe('classifyStatus', () => {
  it('returns "resolved" for Closed status (case-insensitive)', () => {
    expect(classifyStatus('Closed', null)).toBe('resolved');
    expect(classifyStatus('closed', null)).toBe('resolved');
    expect(classifyStatus('CLOSED', null)).toBe('resolved');
  });

  it('returns "resolved" when date_closed is set regardless of status', () => {
    expect(classifyStatus('Open', new Date('2024-01-01'))).toBe('resolved');
    expect(classifyStatus(null, new Date('2024-01-01'))).toBe('resolved');
  });

  it('returns "referred" for status containing "referred" (case-insensitive)', () => {
    expect(classifyStatus('Referred', null)).toBe('referred');
    expect(classifyStatus('referred to other agency', null)).toBe('referred');
    expect(classifyStatus('REFERRED', null)).toBe('referred');
  });

  it('returns "open" for all other statuses', () => {
    expect(classifyStatus('Open', null)).toBe('open');
    expect(classifyStatus('In Progress', null)).toBe('open');
    expect(classifyStatus('New', null)).toBe('open');
    expect(classifyStatus('Cancelled', null)).toBe('open');
    expect(classifyStatus(null, null)).toBe('open');
    expect(classifyStatus('', null)).toBe('open');
  });

  it('prioritizes resolved over referred', () => {
    // If status is "Closed" it's resolved even if it also says referred
    expect(classifyStatus('Closed', null)).toBe('resolved');
    // date_closed takes priority
    expect(classifyStatus('Referred', new Date('2024-01-01'))).toBe('resolved');
  });
});
