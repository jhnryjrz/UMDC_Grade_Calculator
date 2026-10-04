import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import SubjectEditor from './SubjectEditor';
import type { GradeEntry } from './model';

export interface SubjectListProps {
  entries: GradeEntry[];
  onUpdate: (entry: GradeEntry) => void;
  onDelete: (id: string) => void;
}

export default function SubjectList({ entries, onUpdate, onDelete }: SubjectListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!entries.length) return <div className="empty-list">No subjects yet. Add one above to see your GPA.</div>;
  return <ul className="subject-list" aria-label="Your subjects">{entries.map((entry, index) => {
    const label = entry.name || `Subject ${index + 1}`;
    return <li className="subject-row" key={entry.id}>
      {editingId === entry.id ? <SubjectEditor initial={{ name: entry.name, grade: String(entry.grade), unit: String(entry.unit) }}
        submitLabel="Save changes" onCancel={() => setEditingId(null)} onSave={value => { onUpdate({ ...entry, ...value }); setEditingId(null); }} /> : <>
        <div className="subject-identity"><strong>{label}</strong>{entry.code && <span>{entry.code}</span>}</div>
        <div className="subject-value"><small>Grade</small><span>{entry.grade.toFixed(2)}</span></div>
        <div className="subject-value"><small>Units</small><span>{entry.unit}</span></div>
        <div className="subject-actions"><button className="icon-button" type="button" aria-label={`Edit ${label}`} onClick={() => setEditingId(entry.id)}><Pencil size={18} aria-hidden="true" /></button>
          <button className="icon-button danger-action" type="button" aria-label={`Delete ${label}`} onClick={() => onDelete(entry.id)}><Trash2 size={18} aria-hidden="true" /></button></div>
      </>}
    </li>;
  })}</ul>;
}
