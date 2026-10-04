import { expect, it } from 'vitest';
import { summarizeGrades, validateDraft } from './model';

it('weights by units and preserves zero', () => {
  expect(summarizeGrades([
    { id: 'a', name: 'A', grade: 4, unit: 3, source: 'manual' },
    { id: 'b', name: 'B', grade: 0, unit: 1, source: 'manual' },
  ])).toEqual({ count: 2, totalUnits: 4, weightedSum: 12, gpa: 3 });
});
it('has no GPA for an empty list', () => expect(summarizeGrades([]).gpa).toBeNull());
it.each(['', ' ', '3abc', 'Infinity', 'NaN', '-1', '4.01'])(
  'rejects malformed or out-of-range grade %s', grade => {
    expect(validateDraft({ name: '', grade, unit: '3' }).ok).toBe(false);
  },
);
it('accepts zero, whitespace, and decimal units', () => {
  expect(validateDraft({ name: ' Math ', grade: ' 0 ', unit: '0.5' }))
    .toEqual({ ok: true, value: { name: 'Math', grade: 0, unit: 0.5 } });
});
it.each(['0', '-1', '12.1', '2x', 'Infinity'])('rejects units %s', unit => {
  expect(validateDraft({ name: '', grade: '3', unit }).ok).toBe(false);
});
