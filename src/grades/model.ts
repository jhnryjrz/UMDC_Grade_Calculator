export interface GradeEntry {
  id: string;
  name: string;
  code?: string;
  grade: number;
  unit: number;
  source: 'manual' | 'scan';
}

export interface GradeDraft { name: string; grade: string; unit: string }
export type FieldErrors = Partial<Record<'grade' | 'unit', string>>;
export type ValidationResult =
  | { ok: true; value: { name: string; grade: number; unit: number } }
  | { ok: false; errors: FieldErrors };
export interface GradeSummary { count: number; totalUnits: number; weightedSum: number; gpa: number | null }

const decimal = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export function validateDraft(draft: GradeDraft): ValidationResult {
  const errors: FieldErrors = {};
  const gradeText = draft.grade.trim();
  const unitText = draft.unit.trim();
  const grade = Number(gradeText);
  const unit = Number(unitText);
  if (!decimal.test(gradeText) || !Number.isFinite(grade) || grade < 0 || grade > 4)
    errors.grade = 'Enter a grade from 0 to 4.';
  if (!decimal.test(unitText) || !Number.isFinite(unit) || unit <= 0 || unit > 12)
    errors.unit = 'Enter units greater than 0 and at most 12.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name: draft.name.trim(), grade, unit } };
}

export function summarizeGrades(entries: readonly GradeEntry[]): GradeSummary {
  const totalUnits = entries.reduce((sum, entry) => sum + entry.unit, 0);
  const weightedSum = entries.reduce((sum, entry) => sum + entry.grade * entry.unit, 0);
  return { count: entries.length, totalUnits, weightedSum, gpa: totalUnits ? weightedSum / totalUnits : null };
}
