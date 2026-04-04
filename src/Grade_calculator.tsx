import { useState, useRef, useCallback } from "react";
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
  grade: number;
  unit: number;
}

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [apikey, setApiKey] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Validation ── */
  const validate = (g: string, u: string): string | null => {
    const gNum = parseFloat(g),
      uNum = parseFloat(u);
    if (!g || !u) return "Both fields are required.";
    if (isNaN(gNum) || isNaN(uNum)) return "Enter valid numbers.";
    if (gNum < 1.0 || gNum > 4.0) return "Grade must be between 1.0 and 4.0.";
    if (uNum <= 0 || uNum > 12) return "Units must be between 1 and 12.";
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
  const handleImageSelect = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setScanStatus(null);
  };
  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setScanStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleImageSelect(e.dataTransfer.files?.[0]);
  }, []);

  /* ── AI Scan ── */
  const scanImage = async () => {
    if (!imageFile) return;
    setScanning(true);
    setScanStatus(null);

    try {
      const rawBase64 = await fileToBase64(imageFile);
      const base64 = rawBase64.includes(",") ? rawBase64.split(",")[1] : rawBase64;
      const mediaType = imageFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apikey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [
                {
                  text: `You are an academic grade extraction assistant for Filipino university students.
The user uploads a photo or screenshot of their grades.

Extract every subject's final grade and unit count.
Respond ONLY with a valid JSON array — no markdown, no prose.
Format: [{"grade": 2.5, "unit": 3.0}, ...]

Rules:
- grade: number 1.0–4.0 (Philippine system, 4.0 = highest, 1.0 = failing).
- unit: positive number ≤ 12.
- IMPORTANT: If the table has NO column headers (just rows of numbers side-by-side), assume the LEFT column is the Grade and the RIGHT column is the Units.
- Return ONLY the JSON array.`,
                },
              ],
            },
            contents: [
              {
                parts: [
                  { text: "Extract all grades and units from this image." },
                  {
                    inline_data: {
                      mime_type: mediaType,
                      data: base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
      const cleanRaw = raw.replace(/```json|```/g, "").trim();

      let entries: ExtractedEntry[];
      try {
        entries = JSON.parse(cleanRaw);
      } catch {
        throw new Error("Couldn't parse grades. Try a clearer screenshot.");
      }

      if (!Array.isArray(entries) || entries.length === 0) {
        setScanStatus({
          type: "error",
          msg: "No valid grades found in this image. Make sure the image clearly shows a grade report.",
        });
        return;
      }

      const valid = entries.filter(
        (e) =>
          typeof e.grade === "number" &&
          e.grade >= 1.0 &&
          e.grade <= 4.0 &&
          typeof e.unit === "number" &&
          e.unit > 0 &&
          e.unit <= 12,
      );

      if (!valid.length) {
        setScanStatus({
          type: "error",
          msg: "Grades were detected but are outside valid range (1.0–4.0). Check image quality.",
        });
        return;
      }

      const newEntries: GradeEntry[] = valid.map((e, idx) => ({
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
        msg: `Scanned ${valid.length} subject${valid.length !== 1 ? "s" : ""} — GPA calculated automatically below.`,
      });
      clearImage();
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
        {!imagePreview ? (
          <div
            className={`group relative border-[1.5px] border-dashed rounded-2xl px-5 pt-[26px] pb-[22px] flex flex-col items-center gap-2.5 cursor-pointer transition-all duration-200 mb-5 overflow-hidden bg-gold/[0.025] 
              ${dragOver ? "border-gold/65 bg-gold/7 shadow-[0_0_0_4px_rgba(180,148,90,0.06)]" : "border-gold/30"} 
              hover:border-gold/65 hover:bg-gold/7 hover:shadow-[0_0_0_4px_rgba(180,148,90,0.06)]`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {/* Corner decorations */}
            <div className={`absolute top-2 left-2 w-[18px] h-[18px] border-t-2 border-l-2 rounded-tl-[3px] transition-colors ${dragOver ? "border-gold/80" : "border-gold/35"} group-hover:border-gold/80`} />
            <div className={`absolute bottom-2 right-2 w-[18px] h-[18px] border-b-2 border-r-2 rounded-br-[3px] transition-colors ${dragOver ? "border-gold/80" : "border-gold/35"} group-hover:border-gold/80`} />
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[0]"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
            />
            <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center color-gold mb-0.5">
              <ImageUp size={22} className="text-gold" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-gold bg-gold/10 border border-gold/[0.22] rounded-full px-2.5 py-0.75">
              <Sparkles size={9} /> AI Powered
            </span>
            <span className="text-sm font-semibold text-text-ivory text-center">Upload your grade screenshot</span>
            <span className="text-[11px] text-text-muted text-center leading-relaxed">
              Drag & drop or click to browse
              <br />
              CRS · SAIS · MyUSTe · report cards · transcripts
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-4">
            <div className="relative rounded-xl overflow-hidden border border-gold/[0.22]">
              <img src={imagePreview} className="w-full max-h-[200px] object-cover block" alt="Grade screenshot" />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-dark/90 via-transparent to-transparent flex items-end p-3.5 gap-2">
                <span className="text-[11px] text-ivory/60 flex-1 truncate">{imageFile?.name}</span>
                <button className="bg-red-500/15 border border-red-500/25 rounded-[7px] w-[26px] h-[26px] flex items-center justify-center cursor-pointer text-red-500 transition-colors hover:bg-red-500/[0.28]" onClick={clearImage}>
                  <X size={13} />
                </button>
              </div>
            </div>
            <button
              className="w-full bg-gold/10 border-[1.5px] border-gold/35 rounded-[13px] p-[13px_16px] font-dm-sans text-[13px] font-semibold text-gold-light cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-gold/[0.18] hover:border-gold/65 hover:-translate-y-[1px] hover:shadow-[0_4px_20px_rgba(180,148,90,0.18)] active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={scanImage}
              disabled={scanning}
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
          <div className="grid grid-cols-[1fr_157px] gap-2.5 mb-1.5 items-center">
            <input
              className="bg-white/5 border border-white/10 rounded-xl p-[13px_16px] font-dm-sans text-[15px] text-text-ivory outline-none transition-all w-full placeholder:text-white/[0.18] focus:border-gold/[0.6] focus:bg-gold/[0.06] focus:shadow-[0_0_0_3px_rgba(180,148,90,0.1)]"
              type="text"
              placeholder="e.g. Alza..."
              value={apikey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
            <button className="bg-gold border-none rounded-xl w-[157px] h-12 flex items-center justify-center cursor-pointer text-bg-dark transition-all hover:bg-gold-light hover:scale-[1.07] hover:shadow-[0_4px_20px_rgba(180,148,90,0.4)] active:scale-[0.97]" onClick={() => setApiKey(apikey)}>Confirm</button>
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
