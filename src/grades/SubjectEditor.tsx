import { useId, useRef, useState } from 'react';
import { validateDraft, type GradeDraft } from './model';

export interface SubjectEditorProps {
  initial: GradeDraft;
  onSave: (value: { name: string; grade: number; unit: number }) => void;
  onCancel?: () => void;
  submitLabel: string;
}

export default function SubjectEditor({ initial, onSave, onCancel, submitLabel }: SubjectEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<{ grade?: string; unit?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);
  const key = useId();
  const id = (field: string) => `${key}-${field}`;
  const update = (field: keyof GradeDraft, value: string) => {
    setDraft(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined }));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      (result.errors.grade ? gradeRef : unitRef).current?.focus();
      return;
    }
    onSave(result.value);
    if (!onCancel) { setDraft({ name: '', grade: '', unit: '' }); nameRef.current?.focus(); }
  };
  return <form className="subject-editor" onSubmit={submit} onKeyDown={event => { if (event.key === 'Escape' && onCancel) onCancel(); }} noValidate>
    <div><label htmlFor={id('name')}>Subject name (optional)</label>
      <input ref={nameRef} id={id('name')} value={draft.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Mathematics" /></div>
    <div><label htmlFor={id('grade')}>Grade</label>
      <input ref={gradeRef} id={id('grade')} value={draft.grade} onChange={event => update('grade', event.target.value)} inputMode="decimal" placeholder="0–4" aria-invalid={Boolean(errors.grade)} aria-describedby={errors.grade ? id('grade-error') : undefined} />
      {errors.grade && <p className="field-error" id={id('grade-error')} role="alert">{errors.grade}</p>}</div>
    <div><label htmlFor={id('unit')}>Units</label>
      <input ref={unitRef} id={id('unit')} value={draft.unit} onChange={event => update('unit', event.target.value)} inputMode="decimal" placeholder="e.g. 3" aria-invalid={Boolean(errors.unit)} aria-describedby={errors.unit ? id('unit-error') : undefined} />
      {errors.unit && <p className="field-error" id={id('unit-error')} role="alert">{errors.unit}</p>}</div>
    <div className="editor-actions"><button className="button button-primary" type="submit">{submitLabel}</button>
      {onCancel && <button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button>}</div>
  </form>;
}
