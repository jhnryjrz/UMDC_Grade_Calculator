import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Moon, Sun, ImageUp } from 'lucide-react';
import SubjectEditor from './grades/SubjectEditor';
import SubjectList from './grades/SubjectList';
import GpaSummary from './grades/GpaSummary';
import ImportDialog from './grades/ImportDialog';
import { summarizeGrades, type GradeEntry } from './grades/model';

type Theme = 'light' | 'dark';
function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('umdc-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Use system preference. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function GradeCalculator() {
  const [entries, setEntries] = useState<GradeEntry[]>([]);
  const [undo, setUndo] = useState<{ entry: GradeEntry; index: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [announcement, setAnnouncement] = useState('');
  const importTrigger = useRef<HTMLButtonElement>(null);
  const summary = summarizeGrades(entries);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141b1a' : '#f6f7f4');
    try { localStorage.setItem('umdc-theme', theme); } catch { /* Keep in memory. */ }
  }, [theme]);

  const deleteEntry = (id: string) => {
    const index = entries.findIndex(entry => entry.id === id);
    if (index < 0) return;
    setUndo({ entry: entries[index], index });
    setEntries(previous => previous.filter(entry => entry.id !== id));
    setAnnouncement('Subject deleted. Undo is available.');
  };
  const restore = () => {
    if (!undo) return;
    setEntries(previous => {
      const next = [...previous];
      next.splice(Math.min(undo.index, next.length), 0, undo.entry);
      return next;
    });
    setUndo(null);
    setAnnouncement('Subject restored.');
  };
  const closeImport = () => {
    setImportOpen(false);
    requestAnimationFrame(() => importTrigger.current?.focus());
  };
  return <div className="app-shell"><div className="page-wrap">
    <header className="site-header"><div className="brand"><span className="brand-icon"><GraduationCap size={21} aria-hidden="true" /></span>
      <div><strong>UMDC Grade Calculator</strong><span>Academic workspace</span></div></div>
      <button type="button" className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-pressed={theme === 'dark'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button></header>
    <main className="workspace">
      <section className="grades-card" aria-labelledby="grades-title">
        <div className="section-header"><div><p className="eyebrow">Your workspace</p><h1 id="grades-title">Your grades</h1>
          <p>Enter subjects or import screenshots. Your GPA updates when you save.</p></div>
          <button ref={importTrigger} type="button" className="button button-secondary" onClick={() => setImportOpen(true)}><ImageUp size={18} aria-hidden="true" />Import screenshots</button></div>
        <div className="entry-section"><h2>Add a subject</h2><SubjectEditor initial={{ name: '', grade: '', unit: '' }} submitLabel="Add subject"
          onSave={value => { setEntries(previous => [...previous, { id: crypto.randomUUID(), ...value, source: 'manual' }]); setAnnouncement('Subject added.'); }} /></div>
        <div className="list-header"><h2>Subjects <span className="count-pill">{entries.length}</span></h2>
          {undo && <button type="button" className="text-button" onClick={restore}>Undo delete</button>}</div>
        <SubjectList entries={entries} onUpdate={entry => { setEntries(previous => previous.map(current => current.id === entry.id ? entry : current)); setAnnouncement('Subject updated.'); }} onDelete={deleteEntry} />
      </section>
      <GpaSummary summary={summary} />
    </main>
    <p className="grading-help">Grades range from 0 to 4. Units must be greater than 0 and at most 12.</p>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
  </div>
    {importOpen && <ImportDialog existing={entries} onClose={closeImport} onConfirm={added => {
      setEntries(previous => [...previous, ...added]);
      setAnnouncement(`${added.length} ${added.length === 1 ? 'subject' : 'subjects'} added.`);
    }} />}
  </div>;
}
