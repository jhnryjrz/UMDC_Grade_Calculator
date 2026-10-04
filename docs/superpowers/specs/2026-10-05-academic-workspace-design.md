# Academic Workspace Design

Approved direction: academic workspace, confirmed by the user on 2026-10-05.

## Goal
Make entering, checking, and understanding grades the primary experience. Replace the large introduction and scanner-first layout with a compact, responsive workspace.

## Experience
- Compact header with product name, grading help, and theme switch.
- Desktop at 1024px and above: editable subjects occupy approximately two thirds of the main area; a persistent summary occupies the remainder.
- Below 1024px: compact GPA summary above the subject list; normal document scrolling.
- Start with one empty entry row. Optional subject name, grade, and units have visible labels. Add subject commits valid values; Enter submits; Tab follows visual order.
- Keep names/codes from scanned subjects. Unnamed manual or cropped entries receive a display-only Subject N label.
- Saving valid additions, edits, deletions, undo, and confirmed imports immediately updates the summary. Uncommitted input never changes it.
- Invalid inputs retain their text and display a specific inline error.
- Undo restores the most recently deleted subject to its former position. A later deletion replaces the undo candidate.
- Import opens an accessible dialog: select screenshots, provide API key if needed, scan, review, then explicitly add selected subjects.
- Scan results stay separate from committed grades until confirmation. Rows can be corrected or excluded; duplicate candidates are explained. Closing a scan aborts it and ignores late results.
- GPA summary contains GPA, committed subject count, total units, and an expandable weighted calculation explanation.
- Empty summary uses a dash and “Add a subject to see your GPA.”
- Use neutral result copy. Omit honors badges in this release because official eligibility rules have not been established.

## Visual direction
Warm off-white background, white surfaces, charcoal text, restrained deep teal accent. Flatter panels, subtle borders, consistent spacing, fewer badges. Use existing Fira Sans throughout with tabular numbers. Dark mode uses charcoal surfaces and the same hierarchy. Retain Lucide icons.

## Constraints
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

## Acceptance
A student can immediately add named or unnamed subjects, correct a value, undo a deletion, and see an accurate current GPA. A scanner user can inspect and correct extraction before it affects the result. The workspace remains usable on a narrow phone and by keyboard.

