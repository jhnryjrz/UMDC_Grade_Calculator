import { useState, useRef } from "react";
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
  color: string;
}

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
    return { label: "First Honor", color: "#fbbf24" };
  if (gpa <= 3.5 && gpa >= 3.27)
    return { label: "Second Honor", color: "#a3e635" };
  if (gpa <= 3.26 && gpa >= 3.01)
    return { label: "Third Honor", color: "#4ade80" };
  return { label: "Needs Improvement", color: "#f87171" };
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
7. For UMDC/student portal screenshots, rows usually look like: code, subject title, grade, units. Extract those rows even when no column headers are visible.
8. If a screenshot is cropped and only shows the grade/unit columns, still extract every visible row as {"grade": number, "unit": number}. Leave code and subject out.
9. Do not reject rows just because the subject title is cut off, the browser UI is visible, or a notification overlaps the page.
10. Return ONLY the raw JSON array.`,
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
    <div className="min-h-screen bg-bg-dark bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,_rgba(180,148,90,0.13)_0%,_transparent_60%)] bg-[image:var(--background-image-pattern)] flex flex-col items-center px-5 py-12 pb-20 font-dm-sans text-[#e8e0d0] relative">
      <button 
        onClick={() => setShowApiInstructions(true)}
        className="absolute top-5 right-5 p-2.5 bg-white/5 border border-white/10 rounded-full text-white/50 hover:text-gold hover:bg-gold/10 hover:border-gold/30 transition-all z-10 shadow-sm"
        title="How to get API Key"
      >
        <HelpCircle size={20} />
      </button>

      {showApiInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-dark border border-gold/25 rounded-[20px] w-full max-w-md p-7 relative shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <button 
              onClick={() => setShowApiInstructions(false)}
              className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
            <h2 className="font-fraunces text-2xl font-bold text-text-ivory mb-4 flex items-center gap-2.5">
              <Key size={24} className="text-gold" />
              Get Google AI Studio API Key
            </h2>
            <div className="space-y-4 text-[14px] text-text-muted leading-relaxed">
              <p>To use the AI grade scanning feature, you need a free API key from Google AI Studio.</p>
              <ol className="list-decimal list-inside space-y-2.5 ml-1">
                <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-gold hover:text-gold-light hover:underline transition-colors font-medium">Google AI Studio</a>.</li>
                <li>Sign in with your Google account.</li>
                <li>Click on the <strong>"Get API key"</strong> or <strong>"Create API key"</strong> button.</li>
                <li>Create a new key in a new or existing project.</li>
                <li>Copy the generated key and paste it into the API KEY input field here.</li>
              </ol>
              <p className="text-xs text-white/30 pt-3 border-t border-white/5 mt-5">Note: Your API key is stored locally in your browser and is never sent to our servers.</p>
            </div>
            <button 
              onClick={() => setShowApiInstructions(false)}
              className="w-full mt-6 bg-gold/10 border border-gold/35 rounded-xl p-[13px] font-dm-sans text-[14px] font-semibold text-gold-light transition-all hover:bg-gold/[0.18] hover:-translate-y-[1px]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <header className="flex flex-col items-center gap-3 mb-10">
        <div className="flex items-center gap-[7px] bg-gold/10 border border-gold/25 rounded-full px-3.5 pl-2.5 py-1 text-[11px] font-medium tracking-[0.08em] uppercase text-gold">
          <GraduationCap size={12} /> UMDC GRADING SYSTEM
        </div>
        <h1 className="font-fraunces text-4xl sm:text-5xl lg:text-6xl font-bold text-text-ivory tracking-tight leading-[1.05] text-center">
          Grade
          <br />
          <em className="italic text-gold">Calculator</em>
        </h1>
        <p className="text-[13px] text-text-muted tracking-wide">Weighted GPA · 4.0 highest · 1.0 failing</p>
      </header>

      <div className="w-full max-w-[520px] bg-white/[0.03] border border-white/[0.08] rounded-[20px] p-7 backdrop-blur-xl">
        {!imagePreviews.length ? (
          <div
            className={`group relative border-[1.5px] border-dashed rounded-2xl px-5 pt-[26px] pb-[22px] flex flex-col items-center gap-2.5 transition-all duration-200 mb-5 overflow-hidden bg-gold/[0.025] 
              ${!apikey ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              ${dragOver && apikey ? "border-gold/65 bg-gold/7 shadow-[0_0_0_4px_rgba(180,148,90,0.06)]" : "border-gold/30"} 
              ${apikey ? "hover:border-gold/65 hover:bg-gold/7 hover:shadow-[0_0_0_4px_rgba(180,148,90,0.06)]" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (apikey) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { if (!apikey) { e.preventDefault(); return; } handleDrop(e); }}
            onClick={() => {
              if (!apikey) {
                setScanStatus({
                  type: "error",
                  msg: "Please enter your API Key below first before uploading an image.",
                });
              }
            }}
          >
            {/* Corner decorations */}
            <div className={`absolute top-2 left-2 w-[18px] h-[18px] border-t-2 border-l-2 rounded-tl-[3px] transition-colors ${dragOver && apikey ? "border-gold/80" : "border-gold/35"} ${apikey ? "group-hover:border-gold/80" : ""}`} />
            <div className={`absolute bottom-2 right-2 w-[18px] h-[18px] border-b-2 border-r-2 rounded-br-[3px] transition-colors ${dragOver && apikey ? "border-gold/80" : "border-gold/35"} ${apikey ? "group-hover:border-gold/80" : ""}`} />
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className={`absolute inset-0 opacity-0 w-full h-full text-[0] ${!apikey ? "pointer-events-none" : "cursor-pointer"}`}
              onChange={(e) => handleImageSelect(e.target.files)}
              disabled={!apikey}
            />
            <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center color-gold mb-0.5">
              <ImageUp size={22} className="text-gold" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-gold bg-gold/10 border border-gold/[0.22] rounded-full px-2.5 py-0.75">
              <Sparkles size={9} /> AI Powered
            </span>
            <span className="text-sm font-semibold text-text-ivory text-center">
              {!apikey ? "Enter API Key to use Scanner" : `Upload up to ${MAX_IMAGE_UPLOADS} grade screenshots`}
            </span>
            <span className="text-[11px] text-text-muted text-center leading-relaxed">
              Drag & drop or click to browse
              <br />
              CRS · SAIS · MyUSTe · report cards · transcripts
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {imagePreviews.map((preview, index) => (
                <div key={preview} className="relative rounded-xl overflow-hidden border border-gold/[0.22] aspect-[4/3]">
                  <img src={preview} className="w-full h-full object-cover block" alt={`Grade screenshot ${index + 1}`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-bg-dark/90 via-transparent to-transparent flex items-end p-2.5">
                    <span className="text-[10px] text-ivory/70 flex-1 truncate">{imageFiles[index]?.name}</span>
                  </div>
                </div>
              ))}
              <button className="bg-red-500/15 border border-red-500/25 rounded-xl min-h-[84px] flex flex-col items-center justify-center gap-1 cursor-pointer text-red-400 transition-colors hover:bg-red-500/[0.28]" onClick={() => clearImage()}>
                <X size={15} />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Clear</span>
              </button>
            </div>
            <button
              className="w-full bg-gold/10 border-[1.5px] border-gold/35 rounded-[13px] p-[13px_16px] font-dm-sans text-[13px] font-semibold text-gold-light cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-gold/[0.18] hover:border-gold/65 hover:-translate-y-[1px] hover:shadow-[0_4px_20px_rgba(180,148,90,0.18)] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={scanImage}
              disabled={scanning || !apikey}
            >
              {scanning ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Reading your grades…
                </>
              ) : (
                <>
                  <ScanLine size={15} /> Scan &amp; Auto-Calculate
                </>
              )}
            </button>
          </div>
        )}

        {scanStatus && (
          <div className={`p-[11px_14px] rounded-[11px] text-xs flex items-start gap-2.5 mb-4.5 leading-relaxed ${scanStatus.type === "success" ? "bg-green-500/7 border border-green-500/20 text-green-300" : "bg-red-500/7 border border-red-500/20 text-red-300"}`}>
            <span className="shrink-0 mt-0.5">
              {scanStatus.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
            </span>
            <span>{scanStatus.msg}</span>
          </div>
        )}

        <div className="flex items-center gap-3 mb-[22px]">
          <div className="flex-1 h-[1px] bg-white/[0.07]" />
          <span className="text-[10px] font-semibold tracking-widest uppercase text-white/[0.22] whitespace-nowrap">or enter manually</span>
          <div className="flex-1 h-[1px] bg-white/[0.07]" />
        </div>

        <div className="mb-6">
          <div className="grid grid-cols-[1fr_100px_48px] gap-2.5 mb-1.5 px-0.5">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30">API KEY</span>
          </div>
          <div className="mb-1.5">
            <input
              className="bg-white/5 border border-white/10 rounded-xl p-[13px_16px] font-dm-sans text-[15px] text-text-ivory outline-none transition-all w-full placeholder:text-white/[0.18] focus:border-gold/[0.6] focus:bg-gold/[0.06] focus:shadow-[0_0_0_3px_rgba(180,148,90,0.1)]"
              type="text"
              placeholder="e.g. Alza..."
              value={apikey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
          </div>
          <div className="grid grid-cols-[1fr_100px_48px] gap-2.5 mb-1.5 px-0.5">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30">Subject Grade</span>
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30">Units</span>
            <span />
          </div>
          <div className="grid grid-cols-[1fr_100px_48px] gap-2.5">
            <input
              className="bg-white/5 border border-white/10 rounded-xl p-[13px_16px] font-dm-sans text-[15px] text-text-ivory outline-none transition-all w-full placeholder:text-white/[0.18] focus:border-gold/[0.6] focus:bg-gold/[0.06] focus:shadow-[0_0_0_3px_rgba(180,148,90,0.1)]"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1.75"
              value={grade}
              onChange={(e) => { setGrade(e.target.value); setFieldError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
            <input
              className="bg-white/5 border border-white/10 rounded-xl p-[13px_16px] font-dm-sans text-[15px] text-text-ivory outline-none transition-all w-full placeholder:text-white/[0.18] focus:border-gold/[0.6] focus:bg-gold/[0.06] focus:shadow-[0_0_0_3px_rgba(180,148,90,0.1)]"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 3"
              value={unit}
              onChange={(e) => { setUnit(e.target.value); setFieldError(""); }}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
            <button
              className="bg-gold border-none rounded-xl w-12 h-12 flex items-center justify-center cursor-pointer text-bg-dark transition-all hover:bg-gold-light hover:scale-[1.07] hover:shadow-[0_4px_20px_rgba(180,148,90,0.4)] active:scale-[0.97]"
              onClick={addToList}
              title="Add subject"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
          {fieldError && (
            <div className="text-xs text-red-400 mt-2 flex items-center gap-1.25">
              <X size={12} /> {fieldError}
            </div>
          )}
        </div>

        <div className="h-[1px] bg-white/[0.07] mb-5" />

        <div className="flex items-center text-[10px] font-bold tracking-widest uppercase text-white/30 mb-3">
          Subjects
          {gradeList.length > 0 && (
            <span className="inline-flex items-center justify-center bg-gold/15 text-gold rounded-full text-[10px] font-bold w-[19px] h-[19px] ml-[7px]">
              {gradeList.length}
            </span>
          )}
        </div>

        {gradeList.length > 0 && (
          <div className="grid grid-cols-[1fr_90px_80px] gap-2.5 px-1 pb-2.5 mb-1 border-b border-white/[0.06]">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30">Grade</span>
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30">Units</span>
            <span className="text-[10px] font-semibold tracking-widest uppercase text-white/30 text-right">Actions</span>
          </div>
        )}

        <div className="max-h-[290px] overflow-y-auto flex flex-col gap-2 pr-0.75 no-scrollbar">
          {gradeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2.5 py-9 px-5 text-white/20">
              <div className="w-[46px] h-[46px] border border-dashed border-gold/20 rounded-full flex items-center justify-center text-gold/30">
                <BookOpen size={20} />
              </div>
              <p className="text-[13px]">No subjects added yet.</p>
              <p className="text-[11px] opacity-50">Upload a screenshot or enter grades manually</p>
            </div>
          ) : (
            gradeList.map((item) => (
              <div
                key={item.id}
                className={`grid grid-cols-[1fr_90px_80px] gap-2.5 items-center bg-white/[0.03] border border-white/[0.07] rounded-xl p-[11px_14px] transition-all hover:bg-gold/[0.05] hover:border-gold/20 animate-in fade-in slide-in-from-top-2 duration-200 ${item.fromAI ? "border-l-[2.5px] border-l-gold/50 bg-gold/[0.04]" : ""}`}
              >
                <div>
                  {editingId === item.id ? (
                    <input
                      className="bg-gold/10 border border-gold/35 rounded-lg p-1.5 font-fraunces text-base font-semibold text-text-ivory outline-none w-full"
                      value={editGrade}
                      autoFocus
                      onChange={(e) => setEditGrade(e.target.value)}
                    />
                  ) : (
                    <span className="font-fraunces text-xl font-semibold text-text-ivory tracking-tight flex items-center gap-1.5">
                      {item.grade.toFixed(2)}
                      {item.fromAI && <span className="w-1.25 h-1.25 rounded-full bg-gold shrink-0 opacity-70" title="AI scanned" />}
                    </span>
                  )}
                </div>

                <div>
                  {editingId === item.id ? (
                    <input
                      className="bg-gold/10 border border-gold/35 rounded-lg p-1.5 font-dm-sans text-[13px] text-text-ivory outline-none w-full"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                    />
                  ) : (
                    <span className="text-[13px] text-white/50">
                      {item.unit} {item.unit === 1 ? "unit" : "units"}
                    </span>
                  )}
                </div>

                <div className="flex gap-1.5 justify-end">
                  {editingId === item.id ? (
                    <>
                      <button className="bg-white/5 border border-white/[0.08] rounded-lg w-[30px] h-[30px] flex items-center justify-center cursor-pointer text-white/40 transition-colors hover:text-green-400 hover:bg-green-400/10 hover:border-green-400/20" onClick={() => confirmEdit(item.id)}>
                        <Check size={13} />
                      </button>
                      <button className="bg-white/5 border border-white/[0.08] rounded-lg w-[30px] h-[30px] flex items-center justify-center cursor-pointer text-white/40 transition-colors hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20" onClick={cancelEdit}>
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="bg-white/5 border border-white/[0.08] rounded-lg w-[30px] h-[30px] flex items-center justify-center cursor-pointer text-white/40 transition-colors hover:text-text-ivory hover:bg-white/10" onClick={() => startEdit(item)}>
                        <Pencil size={13} />
                      </button>
                      <button className="bg-white/5 border border-white/[0.08] rounded-lg w-[30px] h-[30px] flex items-center justify-center cursor-pointer text-white/40 transition-colors hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20" onClick={() => removeFromList(item.id)}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <button
          className="w-full bg-gradient-to-br from-gold to-gold-light border-none rounded-xl p-[15px] font-fraunces text-[17px] font-semibold text-bg-dark cursor-pointer transition-all tracking-tight mt-5 hover:opacity-90 hover:-translate-y-[1px] hover:shadow-[0_8px_32px_rgba(180,148,90,0.38)] active:translate-y-0 disabled:opacity-25 disabled:cursor-not-allowed"
          onClick={() => calculateGPA()}
          disabled={gradeList.length === 0}
        >
          Calculate GPA
        </button>
      </div>

      {gpa && remark && (
        <div className="w-full max-w-[520px] mt-4 bg-gold/[0.07] border border-gold/25 rounded-[20px] p-[34px_28px_28px] flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-4 duration-400 ease-out">
          <span className="text-[10px] font-bold tracking-widest uppercase text-gold/65 mb-1.5">Your Weighted GPA</span>
          <span className="font-fraunces text-6xl sm:text-7xl lg:text-8xl font-bold leading-none tracking-tight text-text-ivory">{gpa}</span>
          <span
            className="text-[13px] font-semibold mt-3 px-4 py-1.25 rounded-full bg-gold/10 border border-gold/[0.18]"
            style={{ color: remark.color, borderColor: `${remark.color}30` }}
          >
            {remark.label}
          </span>
          <span className="mt-2 text-xs text-white/30">
            {gradeList.length} subject{gradeList.length !== 1 ? "s" : ""} · {gradeList.reduce((s, i) => s + i.unit, 0)} total units
          </span>
        </div>
      )}
    </div>
  );
}
