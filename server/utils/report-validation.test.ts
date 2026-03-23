import { describe, it, expect } from 'vitest';
import { validateReportShape } from './report-validation';

describe('validateReportShape', () => {
  const validReport = {
    neighborhoodName: 'Mira Mesa',
    summary: 'A summary',
    goodNews: ['item1'],
    topIssues: ['issue1'],
    howToParticipate: ['action1'],
    contactInfo: { councilDistrict: 'D6', phone311: '311', anchorLocation: 'Library' },
  };

  it('accepts a valid report shape', () => {
    expect(() => validateReportShape(validReport)).not.toThrow();
  });

  it('rejects null', () => {
    expect(() => validateReportShape(null)).toThrow('not an object');
  });

  it('rejects non-object', () => {
    expect(() => validateReportShape('string')).toThrow('not an object');
  });

  it('rejects missing neighborhoodName', () => {
    const { neighborhoodName, ...rest } = validReport;
    expect(() => validateReportShape(rest)).toThrow('neighborhoodName');
  });

  it('rejects missing summary', () => {
    const { summary, ...rest } = validReport;
    expect(() => validateReportShape(rest)).toThrow('summary');
  });

  it('rejects missing goodNews', () => {
    const { goodNews, ...rest } = validReport;
    expect(() => validateReportShape(rest)).toThrow('goodNews');
  });

  it('rejects missing topIssues', () => {
    const { topIssues, ...rest } = validReport;
    expect(() => validateReportShape(rest)).toThrow('topIssues');
  });

  it('rejects missing howToParticipate', () => {
    const { howToParticipate, ...rest } = validReport;
    expect(() => validateReportShape(rest)).toThrow('howToParticipate');
  });

  it('rejects missing contactInfo', () => {
    const { contactInfo, ...rest } = validReport;
    expect(() => validateReportShape(rest)).toThrow('contactInfo');
  });
});
