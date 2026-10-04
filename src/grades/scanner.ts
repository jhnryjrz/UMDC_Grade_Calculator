import type { GradeDraft, GradeEntry } from './model';

export interface ExtractedEntry { code?: string; subject?: string; grade: number; unit: number }
export interface ImportCandidate { id: string; code?: string; draft: GradeDraft; selected: boolean; duplicate: boolean }
export interface ImportBatch { candidates: ImportCandidate[]; invalidCount: number }

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validPair(grade: unknown, unit: unknown): { grade: number; unit: number } | null {
  const g = finiteNumber(grade), u = finiteNumber(unit);
  return g !== null && u !== null && g >= 0 && g <= 4 && u > 0 && u <= 12 ? { grade: g, unit: u } : null;
}

function asRow(row: unknown): ExtractedEntry | null {
  if (Array.isArray(row)) {
    const pair = validPair(row.at(-2), row.at(-1));
    const words = row.slice(0, -2).filter((part): part is string => typeof part === 'string');
    return pair ? { ...pair, code: words[0], subject: words.slice(1).join(' ') || undefined } : null;
  }
  if (typeof row !== 'object' || row === null) return null;
  const data = row as Record<string, unknown>;
  const pair = validPair(data.grade ?? data.finalGrade ?? data.final_grade ?? data.final ?? data.mark ?? data.rating,
    data.unit ?? data.units ?? data.credit ?? data.credits ?? data.creditUnit ?? data.creditUnits ?? data.credit_unit ?? data.credit_units);
  if (!pair) return null;
  return { ...pair, code: typeof data.code === 'string' ? data.code : undefined,
    subject: typeof (data.subject ?? data.title ?? data.course) === 'string' ? String(data.subject ?? data.title ?? data.course) : undefined };
}

function columnar(data: Record<string, unknown>): ExtractedEntry[] {
  const findArray = (keys: string[]) => keys.map(key => data[key]).find(Array.isArray) as unknown[] | undefined;
  const grades = findArray(['grade', 'grades', 'finalGrade', 'finalGrades', 'final_grade', 'final_grades']);
  const units = findArray(['unit', 'units', 'credit', 'credits', 'creditUnit', 'creditUnits', 'credit_unit', 'credit_units']);
  if (!grades || !units) return [];
  const codes = findArray(['code', 'codes', 'courseCode', 'courseCodes', 'course_code', 'course_codes']);
  const subjects = findArray(['subject', 'subjects', 'title', 'titles', 'course', 'courses']);
  return grades.slice(0, units.length).flatMap((grade, index) => {
    const pair = validPair(grade, units[index]);
    return pair ? [{ ...pair, code: typeof codes?.[index] === 'string' ? String(codes[index]) : undefined,
      subject: typeof subjects?.[index] === 'string' ? String(subjects[index]) : undefined }] : [];
  });
}

function normalize(value: unknown): ExtractedEntry[] {
  if (Array.isArray(value)) {
    if (value.every(item => finiteNumber(item) !== null)) {
      const entries: ExtractedEntry[] = [];
      for (let i = 0; i + 1 < value.length; i += 2) {
        const pair = validPair(value[i], value[i + 1]);
        if (pair) entries.push(pair);
      }
      return entries;
    }
    return value.flatMap(row => { const entry = asRow(row); return entry ? [entry] : []; });
  }
  if (typeof value !== 'object' || value === null) return [];
  const data = value as Record<string, unknown>;
  const columns = columnar(data);
  if (columns.length) return columns;
  for (const key of ['entries', 'grades', 'rows', 'subjects', 'courses', 'results', 'data', 'gradeUnitPairs', 'grade_unit_pairs']) {
    if (Array.isArray(data[key])) return normalize(data[key]);
  }
  const row = asRow(data);
  return row ? [row] : [];
}

export function parseExtractedEntries(raw: string): ExtractedEntry[] {
  const clean = raw.replace(/```(?:json)?|```/gi, '').trim();
  for (const candidate of [clean, clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1),
    clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1)]) {
    if (!candidate) continue;
    try {
      const rows = normalize(JSON.parse(candidate));
      if (rows.length) return rows;
    } catch { /* Try the next candidate. */ }
  }
  return clean.split(/\r?\n/).flatMap(line => {
    const numbers = [...line.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(match => match[0]);
    for (let i = numbers.length - 2; i >= 0; i -= 1) {
      const pair = validPair(numbers[i], numbers[i + 1]);
      if (pair) return [pair];
    }
    return [];
  });
}

function identity(code?: string, name?: string): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return code?.trim() ? `code:${normalize(code)}` : name?.trim() ? `name:${normalize(name)}` : null;
}

export function prepareImport(rows: ExtractedEntry[], existing: readonly GradeEntry[]): ImportBatch {
  const seen = new Set(existing.map(row => identity(row.code, row.name)).filter((key): key is string => Boolean(key)));
  let invalidCount = 0;
  const candidates = rows.flatMap(row => {
    if (!validPair(row.grade, row.unit)) { invalidCount += 1; return []; }
    const key = identity(row.code, row.subject);
    const duplicate = Boolean(key && seen.has(key));
    if (key) seen.add(key);
    return [{ id: crypto.randomUUID(), code: row.code?.trim(),
      draft: { name: row.subject?.trim() ?? '', grade: String(row.grade), unit: String(row.unit) },
      selected: !duplicate, duplicate }];
  });
  return { candidates, invalidCount };
}

function readFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal.addEventListener('abort', abort, { once: true });
    reader.onload = () => { signal.removeEventListener('abort', abort); resolve(String(reader.result).split(',')[1] ?? ''); };
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new DOMException('Scan cancelled', 'AbortError'));
    reader.readAsDataURL(file);
  });
}

export async function scanScreenshots(files: readonly File[], apiKey: string, signal: AbortSignal): Promise<ExtractedEntry[]> {
  if (!files.length || files.length > 5) throw new Error('Select 1 to 5 screenshots.');
  if (!apiKey.trim()) throw new Error('Enter a Google AI API key.');
  const parts = await Promise.all(files.map(async file => ({ inline_data: {
    mime_type: file.type, data: await readFile(file, signal),
  } })));
  if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: 'Extract every visible subject row from all screenshots. Return only JSON array objects with optional code and subject, numeric grade from 0 to 4, and numeric units greater than 0 and at most 12. Keep 0 grades. Ignore GPA summaries and nonnumeric grades. Never merge rows. Include cropped rows without names. Do not repeat the same identified subject across overlapping screenshots.' }] },
      contents: [{ parts: [{ text: 'Extract all subject grades and units.' }, ...parts] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.1, responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
          code: { type: 'STRING' }, subject: { type: 'STRING' }, grade: { type: 'NUMBER' }, unit: { type: 'NUMBER' },
        }, required: ['grade', 'unit'] } } },
    }),
  });
  if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError');
  const data = await response.json();
  if (signal.aborted) throw new DOMException('Scan cancelled', 'AbortError');
  if (!response.ok || data.error) throw new Error(data.error?.message ?? 'The scanner could not contact Google AI. Check your key and try again.');
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof raw !== 'string') throw new Error('Google AI returned no grade data. Try another screenshot.');
  const rows = parseExtractedEntries(raw);
  if (!rows.length) throw new Error('No grade and unit pairs were found. Try a clearer screenshot.');
  return rows;
}
