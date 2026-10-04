import { expect, it } from 'vitest';
import { parseExtractedEntries, prepareImport } from './scanner';

it('parses named rows and valid zero grades', () => {
  expect(parseExtractedEntries('```json\n[{"code":"MATH1","subject":"Math","grade":0,"unit":3}]\n```'))
    .toEqual([{ code: 'MATH1', subject: 'Math', grade: 0, unit: 3 }]);
});
it('parses columnar and cropped pairs', () => {
  expect(parseExtractedEntries('{"grades":[4,3],"units":[3,1]}')).toHaveLength(2);
  expect(parseExtractedEntries('[4,3,3,1]')).toHaveLength(2);
});
it('keeps unnamed equal pairs and flags repeated subject identities', () => {
  const batch = prepareImport([
    { grade: 3, unit: 3 }, { grade: 3, unit: 3 },
    { code: 'MATH1', grade: 3, unit: 3 }, { code: 'MATH1', grade: 3, unit: 3 },
  ], []);
  expect(batch.candidates.map(row => row.selected)).toEqual([true, true, true, false]);
  expect(batch.candidates[3].duplicate).toBe(true);
});
