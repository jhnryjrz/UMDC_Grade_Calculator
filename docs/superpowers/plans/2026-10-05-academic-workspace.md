# Academic Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved compact academic workspace with immediate manual entry, reliable live GPA, and reviewed screenshot imports.

**Architecture:** Keep the single-page React application and existing entry component. Extract grade rules and scanner parsing/network work from the large component; introduce small subject, summary, and import components. Committed subjects are the only source of truth for GPA; editor drafts and import drafts stay separate.

**Tech Stack:** Existing React 19, TypeScript 5, Vite 8, Tailwind 4, Lucide React. Add Vitest, jsdom, and React Testing Library as development dependencies for meaningful calculation and interaction regression tests.

**Spec:** `docs/superpowers/specs/2026-10-05-academic-workspace-design.md`

## Global Constraints
- Keep React, TypeScript, Vite, Tailwind, and the existing browser-to-Google scanner architecture.
- Grades: finite numbers from 0 through 4 inclusive.
- Units: finite numbers greater than 0 and at most 12; decimal units remain supported.
- GPA equals sum(grade * units) / sum(units), rounded to two decimals for display only.
- Maximum five selected screenshots.
- Do not infer a duplicate from grade and units alone.
- API keys remain in component memory and are never persisted or logged.
- No accounts, semester history, cloud persistence, analytics, or deployment work.
- Support 320px and wider, keyboard use, text zoom, both themes, and reduced motion.
- All interactive controls have visible or accessible names; errors identify the affected field.
- Normal text contrast at least 4.5:1; meaningful controls and focus indicators at least 3:1.

## Repository evidence and execution notes
- `src/Grade_calculator.tsx` currently owns parsing, scanning, GPA state, editing, theme, and all UI. Manual changes clear GPA, scanning mutates grades immediately, and extracted names are discarded.
- `src/index.css` contains existing tokens and component styles. `src/App.tsx` renders the calculator. No application test runner is configured.
- Existing parsing accepts object arrays, columnar objects, bare numeric pairs, and text fallback. Preserve supported forms with fixtures during extraction.
- Existing validation uses parseFloat, which accepts trailing junk. New manual validation must reject it.
- Existing staged changes concern the skills directory. Do not stage, commit, or rewrite them. Use explicit application/document paths for any task commit.
- This document plans work; dependency installation, implementation, test execution, and deployment have not occurred.
- The named superpowers execution skills are not in the current available-skills catalog. Before execution, check availability; if unavailable, explain that and agree on ordinary in-session execution rather than claiming to have used them.
- Commit each completed task only when repository/session policy permits; stage only its explicit paths.

## Review Focus
1. Zero grades, decimal units, whitespace, trailing junk, and non-finite numbers: preserve valid values and reject malformed inputs (Task 1).
2. Subjects sharing numeric values and overlapping screenshots: flag identity-based candidates without deleting legitimate unnamed rows (Task 3).
3. Cancel, retry, and late scan completion: no stale response may change a closed dialog or committed subjects (Task 3).
4. Invalid edits and deletion of the final subject: preserve drafts, show field errors, restore empty state, and make Undo reliable (Task 2).
5. Narrow screens, long names, zoom, and keyboard-only import review: actions remain reachable and focus returns correctly (Tasks 4–5).

## File map
| File | Responsibility |
|---|---|
| src/grades/model.ts | Types, strict validation, weighted summary |
| src/grades/model.test.ts | Numerical and validation regression coverage |
| src/grades/SubjectEditor.tsx | Labeled draft inputs, field errors, save/cancel |
| src/grades/SubjectList.tsx | Committed list, row editing and delete controls |
| src/grades/GpaSummary.tsx | Derived result and formula disclosure |
| src/grades/scanner.ts | Existing extraction formats, request, cancellation, candidate preparation |
| src/grades/scanner.test.ts | Parsing, duplicates, and request failure fixtures |
| src/grades/ImportDialog.tsx | Selection, credentials, scanning, review, confirmation |
| src/grades/ImportDialog.test.tsx | Review and cancellation interaction tests |
| src/Grade_calculator.tsx | Workspace orchestration, committed entries, undo, theme |
| src/Grade_calculator.test.tsx | Manual workflow and integrated summary tests |
| src/index.css | Tokens, responsive layout, focus and motion |
| src/test/setup.ts | DOM test cleanup and browser mocks |
| vitest.config.ts | jsdom test configuration, separate from Vite app config |
| package.json / package-lock.json | Development test dependencies and scripts |
| README.md | Actual calculator use, local checks, scanner limits |

Keep `src/App.tsx` and the default calculator export compatible. No routing framework or new production UI dependency is needed.

## Task 1: Establish grade rules and protect existing extraction

**Files:** Create `src/grades/model.ts`, `src/grades/model.test.ts`, `src/test/setup.ts`, `vitest.config.ts`. Modify `package.json`, `package-lock.json`.

**Interfaces:** Produces:
```ts
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
export interface GradeSummary {
  count: number; totalUnits: number; weightedSum: number; gpa: number | null;
}
export function validateDraft(draft: GradeDraft): ValidationResult;
export function summarizeGrades(entries: readonly GradeEntry[]): GradeSummary;
```

- [ ] Install test development dependencies during execution:
```powershell
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```
Check installed versions against the existing Node/Vite environment. Add scripts `"test": "vitest run"` and `"test:watch": "vitest"`.

- [ ] Configure a separate test file:
```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
```
```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((media: string) => ({
    matches: false, media, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

- [ ] Write failing tests against the interfaces before implementing:
```ts
import { expect, it } from 'vitest';
import { summarizeGrades, validateDraft } from './model';
it('weights by units and preserves zero', () => {
  const result = summarizeGrades([
    { id: 'a', name: 'A', grade: 4, unit: 3, source: 'manual' },
    { id: 'b', name: 'B', grade: 0, unit: 1, source: 'manual' },
  ]);
  expect(result).toEqual({ count: 2, totalUnits: 4, weightedSum: 12, gpa: 3 });
});
it('has no GPA for an empty list', () => {
  expect(summarizeGrades([]).gpa).toBeNull();
});
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
```

- [ ] Run `npm test -- src/grades/model.test.ts`; expect missing-module/export failure.
- [ ] Implement decimal-text validation using trimmed input and `/^(?:\d+(?:\.\d*)?|\.\d+)$/`, followed by Number and finite/range checks. Errors: “Enter a grade from 0 to 4.” and “Enter units greater than 0 and at most 12.”
- [ ] Implement summary using unrounded weighted sums; zero entries returns count/units/sum zero and GPA null. Format only in the view with `gpa.toFixed(2)`.
- [ ] Run targeted tests and `npm run build`; expect passing checks. Commit explicit Task 1 files with message `test: establish grade calculation and validation contracts`.

## Task 2: Deliver manual workspace and current results

**Files:** Create `SubjectEditor.tsx`, `SubjectList.tsx`, `GpaSummary.tsx` in `src/grades`; create `src/Grade_calculator.test.tsx`; modify `src/Grade_calculator.tsx`.

**Interfaces:** Consumes Task 1 exports. Component contracts:
```ts
type SubjectEditorProps = {
  initial: GradeDraft;
  onSave: (value: { name: string; grade: number; unit: number }) => void;
  onCancel?: () => void;
  submitLabel: string;
};
type SubjectListProps = {
  entries: GradeEntry[];
  onUpdate: (entry: GradeEntry) => void;
  onDelete: (id: string) => void;
};
type GpaSummaryProps = { summary: GradeSummary };
```

- [ ] Add a failing integration test:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import GradeCalculator from './Grade_calculator';
it('updates GPA on save and restores the last deleted subject', async () => {
  const user = userEvent.setup();
  render(<GradeCalculator />);
  await user.type(screen.getByLabelText('Subject name (optional)'), 'Math');
  await user.type(screen.getByLabelText('Grade'), '3.5');
  await user.type(screen.getByLabelText('Units'), '3');
  await user.click(screen.getByRole('button', { name: 'Add subject', exact: true }));
  expect(screen.getByLabelText('Weighted GPA')).toHaveTextContent('3.50');
  await user.click(screen.getByRole('button', { name: 'Delete Math' }));
  expect(screen.getByLabelText('Weighted GPA')).toHaveTextContent('—');
  await user.click(screen.getByRole('button', { name: 'Undo delete' }));
  expect(screen.getByLabelText('Weighted GPA')).toHaveTextContent('3.50');
});
```
Add an edit test: save Math, choose “Edit Math,” replace its grade with 5, save, assert its inline error and unchanged GPA, then change to 4 and assert GPA 4.00. Add a two-subject test with grades 4/2 and units 3/1; expect 3.50. Use role/label queries scoped to the active editor.

- [ ] Run `npm test -- src/Grade_calculator.test.tsx`; confirm behavior assertions fail on the old UI.
- [ ] Make the orchestrator own `GradeEntry[]`; remove separate GPA state and calculate button. Derive `const summary = summarizeGrades(entries)` each render.
- [ ] Use `crypto.randomUUID()` for new entries. Commit additions at the end for stable entry order. Preserve name/code/source when editing; draft strings remain local to SubjectEditor.
- [ ] Build the visible editor, optional inline row editor, and named edit/delete controls. Enter submits the form; Escape cancels an edit; after adding, clear inputs and focus name. Focus the first invalid field on failed submit.
- [ ] Store undo as `{ entry: GradeEntry; index: number } | null`. Deleting captures the row and its position; Undo inserts it at the saved index, clears the undo candidate, and recomputes the summary. Do not expire Undo on a timer.
- [ ] Use an `output aria-label="Weighted GPA"` in GpaSummary and a separate polite status for committed changes. Render count, total units, and a native details/summary formula disclosure. Omit honors badges and evaluative “Needs Improvement” copy.
- [ ] Temporarily retain the working scan controls until Task 3 replaces them, adapting their committed output to the new GradeEntry type.
- [ ] Run Tasks 1–2 tests and build. Commit explicit Task 2 files with message `feat: add editable subjects and live weighted GPA`.

## Task 3: Review screenshots before importing

**Files:** Create `src/grades/scanner.ts`, `scanner.test.ts`, `ImportDialog.tsx`, `ImportDialog.test.tsx`. Modify `src/Grade_calculator.tsx`.

**Interfaces:** Scanner exports:
```ts
export interface ExtractedEntry {
  code?: string; subject?: string; grade: number; unit: number;
}
export interface ImportCandidate {
  id: string; code?: string; draft: GradeDraft;
  selected: boolean; duplicate: boolean;
}
export interface ImportBatch {
  candidates: ImportCandidate[];
  invalidCount: number;
}
export function parseExtractedEntries(raw: string): ExtractedEntry[];
export function prepareImport(rows: ExtractedEntry[], existing: readonly GradeEntry[]): ImportBatch;
export function scanScreenshots(
  files: readonly File[], apiKey: string, signal: AbortSignal
): Promise<ExtractedEntry[]>;
```
ImportDialog props: `{ existing: GradeEntry[]; onConfirm: (entries: GradeEntry[]) => void; onClose: () => void }`. Component imports GradeDraft/GradeEntry from model.

- [ ] Extract existing parsers and Google request into scanner.ts. Preserve request prompt/schema and endpoint during this UX change. Carry code and subject into draft/committed entries. Keep import normalization separate from strict manual validation.
- [ ] Add parsing fixtures for fenced JSON, zero grades, object arrays, columnar objects, cropped numeric pairs, and plain text pairs. Add this duplicate regression:
```ts
import { expect, it } from 'vitest';
import { prepareImport } from './scanner';
it('keeps unnamed equal pairs and flags repeated subject identities', () => {
  const batch = prepareImport([
    { grade: 3, unit: 3 }, { grade: 3, unit: 3 },
    { code: 'MATH1', grade: 3, unit: 3 },
    { code: 'MATH1', grade: 3, unit: 3 },
  ], []);
  expect(batch.candidates.map(row => row.selected)).toEqual([true, true, true, false]);
  expect(batch.candidates[3].duplicate).toBe(true);
});
```
Normalize identity with trimmed lowercase code when present, otherwise normalized subject title. Matching identities within the batch or against committed entries are “Possible duplicate” candidates, initially unchecked, retained for user override. Different grades for the same identity are still reviewable candidates. Never deduplicate solely by numbers.

- [ ] Run scanner tests to establish failures; implement prepareImport with stable UUIDs, valid finite ranges, and invalidCount for returned unusable entries. Copy: “N returned rows could not be used.” Do not claim to count rows the AI omitted.
- [ ] Implement dialog states `select | scanning | review`. Files can be selected before credentials; enable Scan only with files and a nonblank key. Enforce five files with an explicit message, preserve previews on failure, and support individual removal. Key remains in dialog memory; copy explains that images are sent to Google when scanning.
- [ ] Use a native modal dialog opened with showModal, labeled by its title. Escape/cancel and close call the same cleanup path. Show a close control, constrain scrolling within the viewport, and return focus to the Import screenshots trigger.
- [ ] Store an AbortController and monotonically increasing request ID in refs. Cancel/close aborts the request and invalidates its ID; check ID/signal after file reading, fetch, JSON parsing, and before state updates. A failed request retains selected files and offers Retry. Disable duplicate scan submissions.
- [ ] Review displays editable named candidates with inclusion checkboxes and visible duplicate explanations. Selected invalid rows block confirmation with field errors. Unchecked invalid rows do not block import. Confirm button says “Add N subjects”; disable it for zero selected.
- [ ] Confirm builds GradeEntry objects with source scan and calls onConfirm exactly once. Parent appends via functional state update, closes the dialog, and announces the number added. Opening/scanning/reviewing alone must never mutate committed entries.
- [ ] Mock scanScreenshots in dialog tests and verify review-before-commit:
```tsx
const onConfirm = vi.fn();
vi.mocked(scanScreenshots).mockResolvedValue([
  { code: 'MATH1', subject: 'Math', grade: 3.5, unit: 3 },
]);
render(<ImportDialog existing={[]} onConfirm={onConfirm} onClose={vi.fn()} />);
await user.upload(screen.getByLabelText('Grade screenshots'),
  new File(['image'], 'grades.png', { type: 'image/png' }));
await user.type(screen.getByLabelText('Google AI API key'), 'test-key');
await user.click(screen.getByRole('button', { name: 'Scan screenshots' }));
await screen.findByRole('button', { name: 'Add 1 subject' });
expect(onConfirm).not.toHaveBeenCalled();
await user.click(screen.getByRole('button', { name: 'Add 1 subject' }));
expect(onConfirm).toHaveBeenCalledTimes(1);
expect(onConfirm.mock.calls[0][0][0]).toMatchObject({
  name: 'Math', code: 'MATH1', grade: 3.5, unit: 3, source: 'scan',
});
```
Set up userEvent, imports, scanner module mock, and a jsdom dialog showModal/close shim in this test file. Also test a deferred response resolving after close, retry after rejection, all rows unchecked, and correcting a selected invalid grade. Request tests mock fetch for non-OK responses, absent candidates, malformed JSON, and abort.

- [ ] Remove old scanner/API-help markup and obsolete parsing/state from the orchestrator after integration. Revoke object URLs on removal, replacement, and unmount.
- [ ] Run scanner, dialog, and workspace tests plus build. Commit explicit Task 3 files with message `feat: review scanned grades before adding subjects`.

## Task 4: Apply the academic workspace visual system

**Files:** Modify `src/index.css`, `src/Grade_calculator.tsx`, and the three subject/summary components plus ImportDialog.

**Interfaces:** Components from Tasks 2–3 retain their contracts. Presentation consumes theme tokens and existing theme preference state.

- [ ] Replace the marketing header, glow layers, and competing panel headings with a compact product header and “Your grades” workspace toolbar. Put Import screenshots beside the section title; keep Add subject at the editor.
- [ ] Apply this starting palette and layout, measuring composed contrast before acceptance:
```css
:root {
  --app-bg: #f6f7f4; --surface: #ffffff; --surface-subtle: #eef2ef;
  --ink: #172b29; --muted: #52645f; --border: #c8d3cd;
  --primary: #0f766e; --primary-fill: #0f766e;
  --primary-strong: #115e59; --primary-soft: #e3f2ee; --on-primary: #ffffff;
}
:root[data-theme="dark"] {
  --app-bg: #141b1a; --surface: #1c2623; --surface-subtle: #24312d;
  --ink: #f1f5f3; --muted: #b4c4bd; --border: #536c61;
  --primary: #70d7c5; --primary-fill: #70d7c5;
  --primary-strong: #91e5d6; --primary-soft: #213e35; --on-primary: #102c25;
}
.workspace { display: grid; gap: 24px; }
.workspace-summary { order: -1; }
.font-data { font-family: inherit; font-variant-numeric: tabular-nums; }
@media (min-width: 1024px) {
  .workspace { grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); }
  .workspace-summary { order: initial; position: sticky; top: 24px; align-self: start; }
}
```
Use appropriate visible input borders in both themes; decorative panel separators need not carry control semantics. Update existing Tailwind token mappings and primary text colors to use on-primary.

- [ ] Use existing Fira Sans only; remove Fira Code import. Body/input text 16px, secondary text 14px, section titles 22–24px, GPA 40–48px. Spacing 4/8/12/16/24/32px; panels 16px radius and inputs 10px. Prefer subtle borders to heavy shadows.
- [ ] Use an accessible semantic list of subjects with visible row field labels on phones. On desktop, align labels/values as columns. Long names wrap; all flex/grid children that hold text use min-width: 0. Keep edit/delete hit areas at least 44px.
- [ ] Let the page scroll; remove the hidden-scrollbar, fixed-height subject region. On phones the summary stays compact in normal flow so the keyboard does not obscure entry. Keep the dialog independently scrollable with reachable footer actions.
- [ ] Keep light/dark preference behavior; update theme-color values. Provide grading help with “Grades 0–4; units greater than 0 and at most 12” and the formula, separated from scanner credential help.
- [ ] Retain visible focus, reduced-motion support, and modest color transitions. Confirm required status information is written in text, not conveyed by accent color alone.
- [ ] Run the app with `npm run dev -- --host 127.0.0.1`. Inspect at 320, 375, 768, 1024, and 1440px in both themes, plus 200% zoom. Verify empty, populated, editing, validation, scanning, review, and error states.
- [ ] Run build and existing interaction tests after markup changes. Commit explicit Task 4 files with message `style: introduce responsive academic workspace`.

## Task 5: Verify complete workflows and document use

**Files:** Modify `README.md` and add only necessary regression cases to the tests owned by earlier tasks. Fix application files only for failures found here.

**Interfaces:** End-to-end user behavior through GradeCalculator; no new product API.

- [ ] Verify keyboard sequence: add two subjects using Tab/Enter, edit and cancel, trigger an invalid edit, delete/undo, open import, traverse the modal, close with Escape, confirm focus returns to its trigger.
- [ ] Verify actual modal focus containment in a browser; jsdom dialog shims do not prove this. Check labels/read order, visible focus, live summaries, and errors using browser accessibility tools.
- [ ] Verify numerical example: 4 x 3 plus 2 x 1 gives 3.50; edit second grade to 0 gives 3.00; delete first gives 0.00; Undo gives 3.00. Empty list shows a dash.
- [ ] Verify mock import preserves existing subjects, keeps two unnamed equal pairs, retains names, flags same-code candidates, permits correction/exclusion, and adds only on confirmation. Failure/cancel must preserve committed grades. Do not use real credentials in fixtures.
- [ ] Check screenshot/preview cleanup and repeated open/close. Check unsupported uploads, more than five images, no extracted rows, API errors, and late responses. No success message should imply unseen rows were reviewed.
- [ ] Replace template README with: purpose, `npm ci`, `npm run dev`, manual workflow, import/review workflow, browser-memory key handling, supported ranges, calculation formula, and test/build commands. Explain that the app does not establish honors eligibility.
- [ ] Run the release checks once after fixes:
```powershell
npm test
npm run lint
npm run build
```
Expected: all application tests pass, lint passes, and TypeScript/Vite production build succeeds. If existing lint traverses unrelated skill assets, report that separately and scope any app validation explicitly; do not alter user skill files.
- [ ] Inspect final diff restricted to application and documentation paths. Record browser sizes/themes checked and any environment limitations. Commit explicit files with message `docs: document and verify academic workspace workflows`.

## Completion criteria
All five deliverables meet the design acceptance section; manual and imported grades share validation and calculation; scanner cancellation cannot add grades; both themes and mobile layouts have been visually checked; tests/lint/build pass or concrete external blockers are reported. No automatic deployment.

## Execution handoff
Recommend native in-session execution because the five tasks share one tightly coupled grade model and scan workflow. Review this plan before implementation; the writing-plans skill explicitly asks the user to choose an execution method. Subagent-driven execution is an alternative if the requisite skill is available and the user selects it.

