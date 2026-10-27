import { describe, expect, it } from 'vitest';
import { resolveScreeningStage } from './screeningStage';

describe('per-record screening stage', () => {
  it('routes mixed records independently of the toolbar filter', () => {
    const records = [{screening_stage: 'ta'}, {screening_stage: 'ft'}, {screening_stage: 'ta'}];
    expect(records.map(resolveScreeningStage)).toEqual(['ta', 'ft', 'ta']);
  });
  it('preserves explicit stages and handles legacy records consistently with the server', () => {
    expect(resolveScreeningStage({screening_stage: 'ta', screening_status: 'awaiting_pdf'})).toBe('ta');
    expect(resolveScreeningStage({screening_stage: '', screening_status: 'awaiting_pdf'})).toBe('ft');
    expect(resolveScreeningStage({screening_stage: null, screening_status: 'pending'})).toBe('ta');
  });
  it('rejects an unknown record stage instead of guessing', () => {
    expect(() => resolveScreeningStage({screening_stage: 'invalid'})).toThrow('invalid screening stage');
  });
});
