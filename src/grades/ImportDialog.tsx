import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { prepareImport, scanScreenshots, type ImportCandidate } from './scanner';
import { validateDraft, type GradeEntry } from './model';

export interface ImportDialogProps {
  existing: GradeEntry[];
  onConfirm: (entries: GradeEntry[]) => void;
  onClose: () => void;
}

type Step = 'select' | 'scanning' | 'review';
export default function ImportDialog({ existing, onConfirm, onClose }: ImportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const previews = useRef<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [key, setKey] = useState('');
  const [step, setStep] = useState<Step>('select');
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
      previews.current.forEach(URL.revokeObjectURL);
      if (dialog?.open) dialog.close();
    };
  }, []);
  const close = () => { requestId.current += 1; controllerRef.current?.abort(); onClose(); };
  const setSelectedFiles = (newFiles: File[]) => {
    if (newFiles.length > 5) { setMessage('Select no more than five screenshots.'); return; }
    if (newFiles.some(file => !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))) {
      setMessage('Use PNG, JPG, WebP, or GIF images.'); return;
    }
    previews.current.forEach(URL.revokeObjectURL);
    const nextUrls = newFiles.map(URL.createObjectURL);
    previews.current = nextUrls;
    setFiles(newFiles); setUrls(nextUrls); setMessage('');
  };
  const scan = async () => {
    if (!files.length || !key.trim()) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setMessage(''); setStep('scanning');
    try {
      const rows = await scanScreenshots(files, key, controller.signal);
      if (controller.signal.aborted || id !== requestId.current) return;
      const batch = prepareImport(rows, existing);
      setCandidates(batch.candidates); setInvalidCount(batch.invalidCount); setStep('review');
    } catch (error) {
      if (controller.signal.aborted || id !== requestId.current) return;
      setMessage(error instanceof Error ? error.message : 'Scanning failed. Try again.'); setStep('select');
    }
  };
  const updateCandidate = (id: string, change: Partial<ImportCandidate>) => {
    setCandidates(current => current.map(row => row.id === id ? { ...row, ...change } : row));
    setErrors(current => { const next = { ...current }; delete next[id]; return next; });
  };
  const confirm = () => {
    const selected = candidates.filter(row => row.selected);
    const nextErrors: Record<string, string> = {};
    const entries = selected.flatMap(row => {
      const result = validateDraft(row.draft);
      if (!result.ok) { nextErrors[row.id] = Object.values(result.errors).join(' '); return []; }
      return [{ id: crypto.randomUUID(), code: row.code, ...result.value, source: 'scan' as const }];
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !entries.length) return;
    onConfirm(entries); close();
  };
  const selectedCount = candidates.filter(row => row.selected).length;
  return <dialog ref={dialogRef} className="import-dialog" aria-labelledby="import-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="dialog-header"><div><p className="eyebrow">Screenshot import</p><h2 id="import-title">Import your grades</h2></div>
      <button className="icon-button" type="button" onClick={close} aria-label="Close import"><X size={20} /></button></div>
    {step === 'review' ? <>
      <p className="dialog-intro">Check each extracted subject. Only selected rows will be added to your GPA.</p>
      {invalidCount > 0 && <p className="info-message">{invalidCount} returned {invalidCount === 1 ? 'row could' : 'rows could'} not be used.</p>}
      <div className="review-list">{candidates.map((row, index) => <div className="review-row" key={row.id}>
        <label className="review-check"><input type="checkbox" checked={row.selected} onChange={event => updateCandidate(row.id, { selected: event.target.checked })} />
          <span>Include {row.draft.name || row.code || `subject ${index + 1}`}</span></label>
        {row.duplicate && <p className="duplicate-note">Possible duplicate. Check this row if it is a separate subject.</p>}
        <div className="review-fields"><label>Subject name (optional)<input value={row.draft.name} onChange={event => updateCandidate(row.id, { draft: { ...row.draft, name: event.target.value } })} /></label>
          <label>Grade<input value={row.draft.grade} inputMode="decimal" onChange={event => updateCandidate(row.id, { draft: { ...row.draft, grade: event.target.value } })} /></label>
          <label>Units<input value={row.draft.unit} inputMode="decimal" onChange={event => updateCandidate(row.id, { draft: { ...row.draft, unit: event.target.value } })} /></label></div>
        {errors[row.id] && <p role="alert" className="field-error">{errors[row.id]}</p>}
      </div>)}</div>
      <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setStep('select')}>Back</button>
        <button type="button" className="button button-primary" disabled={selectedCount === 0} onClick={confirm}>Add {selectedCount} {selectedCount === 1 ? 'subject' : 'subjects'}</button></div>
    </> : <>
      <p className="dialog-intro">Select up to five screenshots. You will review and correct the extracted grades before adding them.</p>
      <label className="file-picker">Grade screenshots<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple
        onChange={event => { setSelectedFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
      {files.length > 0 && <ul className="preview-list">{files.map((file, index) => <li key={`${file.name}-${index}`}>
        <img src={urls[index]} alt={`Selected screenshot ${index + 1}`} /><span>{file.name}</span>
        <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => setSelectedFiles(files.filter((_, i) => i !== index))}><X size={18} /></button>
      </li>)}</ul>}
      <label className="key-field">Google AI API key<input type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" /></label>
      <p className="helper-text">Images and this key are sent to Google only when you scan. The key stays in this dialog's memory.</p>
      <a className="help-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get a Google AI Studio API key</a>
      {message && <p className="field-error" role="alert">{message}</p>}
      <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button>
        <button type="button" className="button button-primary" disabled={!files.length || !key.trim() || step === 'scanning'} onClick={scan}>{step === 'scanning' ? 'Scanning…' : 'Scan screenshots'}</button></div>
    </>}
  </dialog>;
}
