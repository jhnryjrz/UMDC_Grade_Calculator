import type { GradeSummary } from './model';

export default function GpaSummary({ summary }: { summary: GradeSummary }) {
  return <aside className="summary-card workspace-summary" aria-labelledby="summary-title">
    <p className="eyebrow">Current result</p>
    <h2 id="summary-title">Weighted GPA</h2>
    <output aria-label="Weighted GPA" className="gpa-number">{summary.gpa === null ? '—' : summary.gpa.toFixed(2)}</output>
    <p className="summary-caption">{summary.gpa === null ? 'Add a subject to see your GPA.' : 'Based on your saved subjects.'}</p>
    <div className="summary-stats"><div><strong>{summary.count}</strong><span>{summary.count === 1 ? 'subject' : 'subjects'}</span></div>
      <div><strong>{summary.totalUnits}</strong><span>total units</span></div></div>
    <details className="formula"><summary>How is this calculated?</summary><p>Each grade is multiplied by its units. The sum is divided by total units.</p>
      {summary.gpa !== null && <p>{summary.weightedSum.toFixed(2)} ÷ {summary.totalUnits} = {summary.gpa.toFixed(2)}</p>}</details>
  </aside>;
}
