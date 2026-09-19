import { useEffect, useRef, useState } from "react";
import {
  Trash2,
  Pencil,
  Check,
  X,
  GraduationCap,
  Plus,
  BookOpen,
  ImageUp,
  Sparkles,
  AlertCircle,
  Loader2,
  ScanLine,
  HelpCircle,
  Key,
  Moon,
  Sun,
  ShieldCheck,
} from "lucide-react";

/* ================================================================
   TYPES
================================================================ */
interface GradeEntry {
  id: number;
  grade: number;
  unit: number;
  fromAI?: boolean;
}

interface ScanStatus {
  type: "success" | "error";
  msg: string;
}

interface GPARemark {
  label: string;
  tone: "first" | "second" | "third" | "improve";
}

type Theme = "light" | "dark";

interface ExtractedEntry {
  code?: string;
  subject?: string;
  grade: number;
  unit: number;
}

const MAX_IMAGE_UPLOADS = 5;
const MIN_GRADE = 0;
const MAX_GRADE = 4;
const MAX_UNITS = 12;

/* ================================================================
   HELPERS
================================================================ */
function getGPARemark(gpa: number): GPARemark {
  if (gpa <= 4.0 && gpa >= 3.51)
    return { label: "First Honor", tone: "first" };
  if (gpa <= 3.5 && gpa >= 3.27)
    return { label: "Second Honor", tone: "second" };
  if (gpa <= 3.26 && gpa >= 3.01)
    return { label: "Third Honor", tone: "third" };
  return { label: "Needs Improvement", tone: "improve" };
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  try {
    const savedTheme = window.localStorage.getItem("umdc-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  } catch {
    // Fall back to the operating-system preference when storage is unavailable.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getSubjectKey(entry: ExtractedEntry): string | null {
  const label = `${entry.code ?? ""} ${entry.subject ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return label || null;
}

function dedupeExtractedEntries(entries: ExtractedEntry[]): ExtractedEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const subjectKey = getSubjectKey(entry);
    if (!subjectKey) return true;

    const key = `${subjectKey}|${entry.grade}|${entry.unit}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getValidGradeUnitPair(values: unknown[]): Pick<ExtractedEntry, "grade" | "unit"> | null {
  const numbers = values
    .map((value) => coerceNumber(value))
    .filter((value): value is number => value !== null);

  for (let i = numbers.length - 2; i >= 0; i -= 1) {
    const grade = numbers[i];
    const unit = numbers[i + 1];

    if (grade >= MIN_GRADE && grade <= MAX_GRADE && unit > 0 && unit <= MAX_UNITS) {
      return { grade, unit };
    }
  }

  return null;
}

function getArrayValue(record: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  return null;
}

function normalizeColumnarEntries(record: Record<string, unknown>): ExtractedEntry[] {
  const gradeValues = getArrayValue(record, ["grade", "grades", "finalGrade", "finalGrades", "final_grade", "final_grades"]);
  const unitValues = getArrayValue(record, ["unit", "units", "credit", "credits", "creditUnit", "creditUnits", "credit_unit", "credit_units"]);
  if (!gradeValues || !unitValues) return [];

  const codeValues = getArrayValue(record, ["code", "codes", "courseCode", "courseCodes", "course_code", "course_codes"]);
  const subjectValues = getArrayValue(record, ["subject", "subjects", "title", "titles", "course", "courses"]);
  const length = Math.min(gradeValues.length, unitValues.length);
  const entries: ExtractedEntry[] = [];

  for (let index = 0; index < length; index += 1) {
    const grade = coerceNumber(gradeValues[index]);
    const unit = coerceNumber(unitValues[index]);
    if (grade === null || unit === null) continue;

    const code = codeValues?.[index];
    const subject = subjectValues?.[index];

    entries.push({
      code: typeof code === "string" ? code : undefined,
      subject: typeof subject === "string" ? subject : undefined,
      grade,
      unit,
    });
  }

  return entries;
}

function normalizeExtractedRow(row: unknown): ExtractedEntry | null {
  if (Array.isArray(row)) {
    const pair = getValidGradeUnitPair(row);
    if (!pair) return null;

    const textValues = row.filter((value): value is string => typeof value === "string");
    return {
      code: textValues[0],
      subject: textValues.slice(1).join(" ") || undefined,
      ...pair,
    };
  }

  if (!isRecord(row)) return null;

  const grade = coerceNumber(
    row.grade ??
      row.finalGrade ??
      row.final_grade ??
      row.final ??
      row.mark ??
      row.rating,
  );
  const unit = coerceNumber(
    row.unit ??
      row.units ??
      row.credit ??
      row.credits ??
      row.creditUnit ??
      row.creditUnits ??
      row.credit_unit ??
      row.credit_units,
  );

  if (grade !== null && unit !== null) {
    return {
      code: typeof row.code === "string" ? row.code : undefined,
      subject: typeof row.subject === "string" ? row.subject : undefined,
      grade,
      unit,
    };
  }

  const pair = getValidGradeUnitPair(Object.values(row));
  if (!pair) return null;

  return {
    code: typeof row.code === "string" ? row.code : undefined,
    subject:
      typeof row.subject === "string"
        ? row.subject
        : typeof row.title === "string"
          ? row.title
          : typeof row.course === "string"
            ? row.course
            : undefined,
    ...pair,
  };
}

function normalizeExtractedEntries(parsed: unknown): ExtractedEntry[] {
  if (Array.isArray(parsed) && parsed.every((item) => coerceNumber(item) !== null)) {
    const entries: ExtractedEntry[] = [];

    for (let i = 0; i < parsed.length - 1; i += 2) {
      const pair = getValidGradeUnitPair([parsed[i], parsed[i + 1]]);
      if (pair) entries.push(pair);
    }

    return entries;
  }

  if (isRecord(parsed)) {
    const columnarEntries = normalizeColumnarEntries(parsed);
    if (columnarEntries.length) return columnarEntries;

    const singleEntry = normalizeExtractedRow(parsed);
    if (singleEntry) return [singleEntry];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.entries)
      ? parsed.entries
      : isRecord(parsed) && Array.isArray(parsed.grades)
        ? parsed.grades
        : isRecord(parsed) && Array.isArray(parsed.rows)
          ? parsed.rows
          : isRecord(parsed) && Array.isArray(parsed.subjects)
            ? parsed.subjects
            : isRecord(parsed) && Array.isArray(parsed.courses)
              ? parsed.courses
              : isRecord(parsed) && Array.isArray(parsed.results)
                ? parsed.results
                : isRecord(parsed) && Array.isArray(parsed.data)
                  ? parsed.data
                  : isRecord(parsed) && Array.isArray(parsed.gradeUnitPairs)
                    ? parsed.gradeUnitPairs
                    : isRecord(parsed) && Array.isArray(parsed.grade_unit_pairs)
                      ? parsed.grade_unit_pairs
                  : [];

  return rows.flatMap((row) => {
    const entry = normalizeExtractedRow(row);
    return entry ? [entry] : [];
  });
}

function parseTextEntries(raw: string): ExtractedEntry[] {
  return raw
    .split(/\r?\n/)
    .flatMap((line) => {
      const matches = [...line.matchAll(/\b\d+(?:\.\d+)?\b/g)];
      if (matches.length < 2) return [];

      const pair = getValidGradeUnitPair(matches.map((match) => match[0]));
      return pair ? [pair] : [];
    });
}

function parseExtractedEntries(raw: string): ExtractedEntry[] {
  const cleanRaw = raw.replace(/```(?:json)?|```/gi, "").trim();
  const candidates = [
    cleanRaw,
    cleanRaw.slice(cleanRaw.indexOf("["), cleanRaw.lastIndexOf("]") + 1),
    cleanRaw.slice(cleanRaw.indexOf("{"), cleanRaw.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate.length > 1);

  for (const candidate of candidates) {
    try {
      const entries = normalizeExtractedEntries(JSON.parse(candidate));
      if (entries.length) return entries;
    } catch {
      // Try the next likely JSON segment.
    }
  }

  return parseTextEntries(cleanRaw);
}

/* ================================================================
   COMPONENT
================================================================ */
export default function GradeCalculator() {
  /* Grade list */
  const [gradeList, setGradeList] = useState<GradeEntry[]>([]);
  const [grade, setGrade] = useState("");
  const [unit, setUnit] = useState("");
  const [gpa, setGpa] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState("");

  /* Inline edit */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editGrade, setEditGrade] = useState("");
  const [editUnit, setEditUnit] = useState("");

  /* Image scan */
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [apikey, setApiKey] = useState<string>("");
  const [showApiInstructions, setShowApiInstructions] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const modalCloseButtonRef = useRef<HTMLButtonElement>(null);

  const isDarkMode = theme === "dark";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#08111f" : "#f4f8ff");

    try {
      window.localStorage.setItem("umdc-theme", theme);
    } catch {
      // The theme still works for this session when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    if (!showApiInstructions) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalCloseButtonRef.current?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowApiInstructions(false);
        window.requestAnimationFrame(() => helpButtonRef.current?.focus());
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [showApiInstructions]);

  const closeApiInstructions = () => {
    setShowApiInstructions(false);
    window.requestAnimationFrame(() => helpButtonRef.current?.focus());
  };

  /* ── Validation ── */
  const validate = (g: string, u: string): string | null => {
    const gNum = parseFloat(g),
      uNum = parseFloat(u);
    if (!g || !u) return "Enter both grade and units.";
    if (isNaN(gNum) || isNaN(uNum)) return "Enter valid numbers.";
    if (gNum < MIN_GRADE || gNum > MAX_GRADE) return "Grade must be between 0.0 and 4.0.";
    if (uNum <= 0 || uNum > MAX_UNITS) return "Units must be between 1 and 12.";
    return null;
  };

  /* ── Manual add ── */
  const addToList = () => {
    const err = validate(grade, unit);
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError("");
    setGradeList((prev) => [
      {
        id: Date.now(),
        grade: parseFloat(grade),
        unit: parseFloat(unit),
        fromAI: false,
      },
      ...prev,
    ]);
    setGrade("");
    setUnit("");
    setGpa(null);
  };

  /* ── Delete & edit ── */
  const removeFromList = (id: number) => {
    setGradeList((prev) => prev.filter((i) => i.id !== id));
    setGpa(null);
  };
  const startEdit = (item: GradeEntry) => {
    setEditingId(item.id);
    setEditGrade(item.grade.toString());
    setEditUnit(item.unit.toString());
  };
  const cancelEdit = () => setEditingId(null);
  const confirmEdit = (id: number) => {
    if (validate(editGrade, editUnit)) return;
    setGradeList((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, grade: parseFloat(editGrade), unit: parseFloat(editUnit) }
          : i,
      ),
    );
    setEditingId(null);
    setGpa(null);
  };

  /* ── GPA calculation ── */
  const calculateGPA = (list: GradeEntry[] = gradeList) => {
    if (!list.length) return;
    const totalUnits = list.reduce((s, i) => s + i.unit, 0);
    const weightedSum = list.reduce((s, i) => s + i.grade * i.unit, 0);
    setGpa((weightedSum / totalUnits).toFixed(2));
  };

  /* ── Image select / drag ── */
  const handleImageSelect = (files: FileList | File[] | null | undefined) => {
    const uploadedImages = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    const selectedImages = uploadedImages.slice(0, MAX_IMAGE_UPLOADS);

    if (!selectedImages.length) return;

    imagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setImageFiles(selectedImages);
    setImagePreviews(selectedImages.map((file) => URL.createObjectURL(file)));
    setScanStatus(
      uploadedImages.length > MAX_IMAGE_UPLOADS
        ? {
            type: "error",
            msg: `Only the first ${MAX_IMAGE_UPLOADS} images were selected.`,
          }
        : null,
    );
  };
  const clearImage = (options?: { preserveStatus?: boolean }) => {
    imagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setImageFiles([]);
    setImagePreviews([]);
    if (!options?.preserveStatus) setScanStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleImageSelect(e.dataTransfer.files);
  };

  /* ── AI Scan ── */
  const scanImage = async () => {
    if (!imageFiles.length) return;
    
    setScanning(true);
    setScanStatus(null);

    try {
      const imageParts = await Promise.all(
        imageFiles.map(async (file) => {
          const rawBase64 = await fileToBase64(file);
          const base64 = rawBase64.includes(",") ? rawBase64.split(",")[1] : rawBase64;
          const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

          return {
            inline_data: {
              mime_type: mediaType,
              data: base64,
            },
          };
        }),
      );

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apikey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [
                {
                  text: `You are an expert academic grade extraction assistant.
The user will upload a photo or screenshot of their grades.

Your task is to extract every visible subject row's final grade and unit (credit) count from all uploaded images.
Respond ONLY with a valid JSON array of objects. Do NOT use markdown, code blocks (\`\`\`json), or any conversational text.
Format Example: [{"code": "CCE 103/L", "subject": "COMPUTER PROGRAMMING 2", "grade": 3.5, "unit": 3.0}, {"code": "GE 1", "subject": "UNDERSTANDING THE SELF", "grade": 3.0, "unit": 3.0}]

CRITICAL RULES:
1. "code" is the subject code if visible. "subject" is the subject title if visible.
2. "grade": Must be a number between 0.0 and 4.0. A 0.0 value is valid when it appears in the grade column.
3. "unit": Must be a positive number no greater than 12. Both grade and unit often have decimal places (e.g., 3.0, 3.5).
4. Exclude non-numeric grades (e.g., "INC", "DRP") and text like subject names. Ignore overall GPA/GWA summaries or total units. Extract ONLY individual subject rows.
5. When you see two numbers at the end of a subject row (or standing alone without headers): The LEFT number is ALWAYS the Grade, and the RIGHT number is ALWAYS the Units.
6. When screenshots overlap, the same subject row may appear in multiple images. Return that subject ONLY ONCE.
7. Return ONE JSON object PER SUBJECT ROW. Never summarize multiple rows into one object. Never return arrays of grades/units inside a single object.
8. For UMDC/student portal screenshots, rows usually look like: code, subject title, grade, units. Extract those rows even when no column headers are visible.
9. If a screenshot is cropped and only shows the grade/unit columns, still extract every visible row as {"grade": number, "unit": number}. Leave code and subject out.
10. Do not reject rows just because the subject title is cut off, the browser UI is visible, or a notification overlaps the page.
11. Return ONLY the raw JSON array.`,
                },
              ],
            },
            contents: [
              {
                parts: [
                  { text: "Extract all grades and units from every uploaded image." },
                  ...imageParts,
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.1,
              responseMimeType: "application/json",
              responseSchema: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    code: { type: "STRING" },
                    subject: { type: "STRING" },
                    grade: { type: "NUMBER" },
                    unit: { type: "NUMBER" },
                  },
                  required: ["grade", "unit"],
                },
              },
            },
          }),
        },
      );

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message ?? "The grade scanner could not contact Google AI. Check your API key and try again.");
      }

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
      const entries = parseExtractedEntries(raw);

      if (!Array.isArray(entries) || entries.length === 0) {
        setScanStatus({
          type: "error",
          msg: "I could not find grade/unit pairs in this upload. Try adding one full screenshot that shows the subject rows plus the two number columns, or crop only the grade and units columns.",
        });
        return;
      }

      const valid = entries.filter(
        (e) =>
          typeof e.grade === "number" &&
          e.grade >= MIN_GRADE &&
          e.grade <= MAX_GRADE &&
          typeof e.unit === "number" &&
          e.unit > 0 &&
          e.unit <= MAX_UNITS,
      );

      if (!valid.length) {
        setScanStatus({
          type: "error",
          msg: "I found numbers, but none matched the expected grade/unit format: grade 0.0 to 4.0 and units 1 to 12.",
        });
        return;
      }

      const uniqueValid = dedupeExtractedEntries(valid);
      const duplicateCount = valid.length - uniqueValid.length;
      const skippedCount = entries.length - valid.length;

      const newEntries: GradeEntry[] = uniqueValid.map((e, idx) => ({
        id: Date.now() + idx,
        grade: e.grade,
        unit: e.unit,
        fromAI: true,
      }));
      const merged = [...newEntries, ...gradeList];
      setGradeList(merged);
      calculateGPA(merged);

      setScanStatus({
        type: "success",
        msg: `Scanned ${uniqueValid.length} subject${uniqueValid.length !== 1 ? "s" : ""}${duplicateCount ? ` and skipped ${duplicateCount} duplicate${duplicateCount !== 1 ? "s" : ""}` : ""}${skippedCount ? `, with ${skippedCount} unreadable row${skippedCount !== 1 ? "s" : ""} ignored` : ""}. GPA calculated automatically below.`,
      });
      clearImage({ preserveStatus: true });
    } catch (err: unknown) {
      setScanStatus({
        type: "error",
        msg: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setScanning(false);
    }
  };

  const remark = gpa ? getGPARemark(parseFloat(gpa)) : null;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-app text-ink transition-colors duration-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,var(--glow-primary),transparent_30%),radial-gradient(circle_at_88%_18%,var(--glow-secondary),transparent_28%)]" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9">
        <nav className="mb-10 flex items-center justify-between" aria-label="Utility navigation">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fill text-white shadow-[0_8px_24px_var(--shadow-primary)]">
              <GraduationCap size={21} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">UMDC Grade Calculator</p>
              <p className="text-xs text-muted">Student grade workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button ref={helpButtonRef} type="button" className="icon-button" onClick={() => setShowApiInstructions(true)} aria-label="How to get a Google AI Studio API key" title="API key help">
              <HelpCircle size={19} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" onClick={() => setTheme(isDarkMode ? "light" : "dark")} aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`} aria-pressed={isDarkMode} title={`Switch to ${isDarkMode ? "light" : "dark"} mode`}>
              {isDarkMode ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>
          </div>
        </nav>

        <header className="mb-8 max-w-3xl sm:mb-10">
          <div className="eyebrow mb-4"><Sparkles size={13} aria-hidden="true" />Simple, accurate, student-friendly</div>
          <h1 className="max-w-2xl text-balance text-4xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-[58px]">
            Calculate your GPA with <span className="text-primary">less guesswork.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-7 text-muted sm:text-base">
            Add grades manually or scan your screenshots with AI. Your weighted result uses the familiar 4.0 grading scale.
          </p>
        </header>

        <main className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
          <section className="panel p-5 sm:p-7" aria-labelledby="grade-entry-title">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Grade input</p>
                <h2 id="grade-entry-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Add your grades</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted">Scan a screenshot or enter each subject yourself.</p>
              </div>
              <span className="hidden rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary sm:inline-flex">4.0 scale</span>
            </div>

            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="field-label" htmlFor="api-key">Google AI API key</label>
                <button type="button" className="text-link" onClick={() => setShowApiInstructions(true)}>How do I get one?</button>
              </div>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={17} aria-hidden="true" />
                <input id="api-key" className="field field-with-icon" type="password" placeholder="Paste your Google AI Studio key" value={apikey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted">
                <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={14} aria-hidden="true" />Used only in your browser to send images directly to Google AI.
              </p>
            </div>

            <div className="mb-7">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Scan grade screenshots</h3>
                <span className="text-xs text-muted">Up to {MAX_IMAGE_UPLOADS} images</span>
              </div>

              {!imagePreviews.length ? (
                <div
                  className={`drop-zone ${dragOver && apikey ? "is-dragging" : ""} ${!apikey ? "is-disabled" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-disabled={!apikey}
                  aria-label={apikey ? "Upload grade screenshots" : "Enter an API key before uploading screenshots"}
                  onDragOver={(event) => { event.preventDefault(); if (apikey) setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => { if (!apikey) { event.preventDefault(); return; } handleDrop(event); }}
                  onClick={() => { if (apikey) fileInputRef.current?.click(); else setScanStatus({ type: "error", msg: "Enter your API key before uploading a screenshot." }); }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (apikey) fileInputRef.current?.click();
                    else setScanStatus({ type: "error", msg: "Enter your API key before uploading a screenshot." });
                  }}
                >
                  <input ref={fileInputRef} id="grade-screenshots" type="file" accept="image/*" multiple className="sr-only" onChange={(event) => handleImageSelect(event.target.files)} disabled={!apikey} aria-label="Select grade screenshots" />
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><ImageUp size={22} aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-semibold">{apikey ? "Drop screenshots here" : "Add your API key first"}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{apikey ? "or click to browse PNG, JPG, and WebP files" : "The scanner unlocks once a key is entered"}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {imagePreviews.map((preview, index) => (
                      <div key={preview} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-subtle">
                        <img src={preview} className="h-full w-full object-cover" alt={`Grade screenshot ${index + 1}`} />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-2.5 pt-7"><span className="block truncate text-[10px] font-medium text-white">{imageFiles[index]?.name}</span></div>
                      </div>
                    ))}
                    <button type="button" className="clear-upload-button" onClick={() => clearImage()} aria-label="Clear selected screenshots"><X size={17} aria-hidden="true" /><span>Clear</span></button>
                  </div>
                  <button type="button" className="secondary-button w-full" onClick={scanImage} disabled={scanning || !apikey}>
                    {scanning ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <ScanLine size={17} aria-hidden="true" />}
                    {scanning ? "Reading your grades…" : "Scan and auto-calculate"}
                  </button>
                </div>
              )}

              {scanStatus && (
                <div className={`status-message mt-3 ${scanStatus.type === "success" ? "status-success" : "status-error"}`} role="status" aria-live="polite">
                  {scanStatus.type === "success" ? <Check size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}<span>{scanStatus.msg}</span>
                </div>
              )}
            </div>

            <div className="divider-label mb-5"><span>or enter manually</span></div>
            <form onSubmit={(event) => { event.preventDefault(); addToList(); }} noValidate>
              <div className="grid grid-cols-[minmax(0,1fr)_96px_48px] gap-2.5 sm:grid-cols-[minmax(0,1fr)_120px_48px]">
                <div>
                  <label className="field-label" htmlFor="subject-grade">Subject grade</label>
                  <input id="subject-grade" className="field mt-2 font-data" type="text" inputMode="decimal" placeholder="1.75" value={grade} onChange={(event) => { setGrade(event.target.value); setFieldError(""); }} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "grade-entry-error" : undefined} />
                </div>
                <div>
                  <label className="field-label" htmlFor="subject-units">Units</label>
                  <input id="subject-units" className="field mt-2 font-data" type="text" inputMode="decimal" placeholder="3" value={unit} onChange={(event) => { setUnit(event.target.value); setFieldError(""); }} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "grade-entry-error" : undefined} />
                </div>
                <div className="flex items-end"><button type="submit" className="primary-icon-button" aria-label="Add subject" title="Add subject"><Plus size={20} strokeWidth={2.5} aria-hidden="true" /></button></div>
              </div>
              {fieldError && <p id="grade-entry-error" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger" role="alert"><AlertCircle size={14} aria-hidden="true" />{fieldError}</p>}
            </form>
          </section>

          <section className="panel flex min-h-[520px] flex-col p-5 sm:p-7" aria-labelledby="subjects-title">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Summary</p>
                <h2 id="subjects-title" className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">Your subjects<span className="count-badge" aria-label={`${gradeList.length} subjects`}>{gradeList.length}</span></h2>
              </div>
              {gradeList.length > 0 && <span className="mt-1 text-xs text-muted">{gradeList.reduce((sum, item) => sum + item.unit, 0)} total units</span>}
            </div>

            <div className={`result-card mb-5 ${gpa && remark ? "has-result" : ""}`} aria-live="polite">
              {gpa && remark ? (
                <><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Weighted GPA</p><p className="mt-1 font-data text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{gpa}</p></div><span className={`remark-badge remark-${remark.tone}`}>{remark.label}</span></>
              ) : (
                <><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><GraduationCap size={20} aria-hidden="true" /></span><div><p className="text-sm font-semibold">Your GPA will appear here</p><p className="mt-1 text-xs leading-5 text-muted">Add at least one subject, then calculate your weighted result.</p></div></>
              )}
            </div>

            {gradeList.length > 0 && <div className="subject-grid mb-2 border-b border-border px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted" aria-hidden="true"><span>Grade</span><span>Units</span><span className="text-right">Actions</span></div>}
            <div className="no-scrollbar flex max-h-[385px] min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
              {gradeList.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-subtle px-6 py-12 text-center">
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><BookOpen size={21} aria-hidden="true" /></span>
                  <p className="text-sm font-semibold">No subjects added yet</p><p className="mt-1.5 max-w-[240px] text-xs leading-5 text-muted">Use the form or scanner to build your grade list.</p>
                </div>
              ) : gradeList.map((item) => (
                <div key={item.id} className={`subject-grid subject-row ${item.fromAI ? "is-scanned" : ""}`}>
                  <div className="min-w-0">
                    {editingId === item.id ? <input className="compact-field font-data" value={editGrade} inputMode="decimal" aria-label="Edit grade" autoFocus onChange={(event) => setEditGrade(event.target.value)} /> : <span className="flex items-center gap-2 font-data text-lg font-semibold tracking-tight">{item.grade.toFixed(2)}{item.fromAI && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="AI scanned" aria-label="AI scanned" />}</span>}
                  </div>
                  <div className="min-w-0">
                    {editingId === item.id ? <input className="compact-field font-data" value={editUnit} inputMode="decimal" aria-label="Edit units" onChange={(event) => setEditUnit(event.target.value)} /> : <span className="text-xs text-muted">{item.unit} {item.unit === 1 ? "unit" : "units"}</span>}
                  </div>
                  <div className="flex justify-end gap-1.5">
                    {editingId === item.id ? (
                      <><button type="button" className="row-action is-confirm" onClick={() => confirmEdit(item.id)} aria-label="Save subject changes" title="Save changes"><Check size={15} aria-hidden="true" /></button><button type="button" className="row-action is-danger" onClick={cancelEdit} aria-label="Cancel editing" title="Cancel editing"><X size={15} aria-hidden="true" /></button></>
                    ) : (
                      <><button type="button" className="row-action" onClick={() => startEdit(item)} aria-label={`Edit grade ${item.grade.toFixed(2)}`} title="Edit subject"><Pencil size={15} aria-hidden="true" /></button><button type="button" className="row-action is-danger" onClick={() => removeFromList(item.id)} aria-label={`Delete grade ${item.grade.toFixed(2)}`} title="Delete subject"><Trash2 size={15} aria-hidden="true" /></button></>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="primary-button mt-5 w-full" onClick={() => calculateGPA()} disabled={gradeList.length === 0}>Calculate weighted GPA</button>
          </section>
        </main>

        <footer className="mt-7 flex flex-col gap-1 text-xs leading-5 text-muted sm:flex-row sm:items-center sm:justify-between"><p>Weighted GPA · 4.0 highest · 1.0 failing</p><p>Built for quick academic planning.</p></footer>
      </div>

      {showApiInstructions && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeApiInstructions(); }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="api-help-title" aria-describedby="api-help-description">
            <button ref={modalCloseButtonRef} type="button" className="icon-button absolute right-4 top-4" onClick={closeApiInstructions} aria-label="Close API key instructions"><X size={18} aria-hidden="true" /></button>
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Key size={21} aria-hidden="true" /></span>
            <h2 id="api-help-title" className="pr-10 text-xl font-semibold tracking-tight sm:text-2xl">Get a Google AI Studio API key</h2>
            <p id="api-help-description" className="mt-2 text-sm leading-6 text-muted">The AI scanner needs a free key to read grades from screenshots.</p>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-muted">
              <li className="instruction-step"><span>1</span><p>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-link">Google AI Studio</a> and sign in.</p></li>
              <li className="instruction-step"><span>2</span><p>Select <strong className="text-ink">Get API key</strong>, then create a key in a new or existing project.</p></li>
              <li className="instruction-step"><span>3</span><p>Copy the key and paste it into the API key field in the calculator.</p></li>
            </ol>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-border bg-surface-subtle p-3 text-xs leading-5 text-muted"><ShieldCheck className="mt-0.5 shrink-0 text-primary" size={15} aria-hidden="true" />The key stays in this browser session and is sent only to Google AI when you scan images.</div>
            <button type="button" className="primary-button mt-6 w-full" onClick={closeApiInstructions}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );

}
