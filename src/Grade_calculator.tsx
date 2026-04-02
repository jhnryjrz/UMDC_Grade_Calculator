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
   STYLES
================================================================ */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .gc-root {
    min-height: 100vh;
    background: #080c12;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180,148,90,0.13) 0%, transparent 60%),
      url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23b4945a' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    font-family: 'DM Sans', sans-serif;
    color: #e8e0d0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 20px 80px;
  }

  /* Header */
  .gc-header { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 40px; }
  .gc-badge {
    display: flex; align-items: center; gap: 7px;
    background: rgba(180,148,90,0.1); border: 1px solid rgba(180,148,90,0.25);
    border-radius: 100px; padding: 5px 14px 5px 10px;
    font-size: 11px; font-weight: 500; letter-spacing: 0.08em;
    text-transform: uppercase; color: #b4945a;
  }
  .gc-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(36px, 6vw, 58px); font-weight: 700; color: #f0e8d8;
    letter-spacing: -0.02em; line-height: 1.05; text-align: center;
  }
  .gc-title em { font-style: italic; color: #b4945a; }
  .gc-subtitle { font-size: 13px; color: rgba(232,224,208,0.4); letter-spacing: 0.03em; }

  /* Card */
  .gc-card {
    width: 100%; max-width: 520px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px; padding: 28px; backdrop-filter: blur(12px);
  }

  /* ── Scan zone ── */
  .gc-scan-zone {
    position: relative;
    border: 1.5px dashed rgba(180,148,90,0.3); border-radius: 16px;
    padding: 26px 20px 22px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
    margin-bottom: 20px; overflow: hidden;
    background: rgba(180,148,90,0.025);
  }
  .gc-scan-zone::before, .gc-scan-zone::after {
    content: ''; position: absolute;
    width: 18px; height: 18px; border-color: rgba(180,148,90,0.35); border-style: solid;
    transition: border-color 0.2s;
  }
  .gc-scan-zone::before { top: 8px; left: 8px; border-width: 2px 0 0 2px; border-radius: 3px 0 0 0; }
  .gc-scan-zone::after  { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; border-radius: 0 0 3px 0; }
  .gc-scan-zone:hover, .gc-scan-zone.drag-over {
    border-color: rgba(180,148,90,0.65); background: rgba(180,148,90,0.07);
    box-shadow: 0 0 0 4px rgba(180,148,90,0.06);
  }
  .gc-scan-zone:hover::before, .gc-scan-zone:hover::after,
  .gc-scan-zone.drag-over::before, .gc-scan-zone.drag-over::after {
    border-color: rgba(180,148,90,0.8);
  }
  .gc-scan-zone input[type="file"] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer;
    width: 100%; height: 100%; font-size: 0;
  }
  .gc-scan-icon {
    width: 48px; height: 48px; border-radius: 14px;
    background: rgba(180,148,90,0.1); border: 1px solid rgba(180,148,90,0.2);
    display: flex; align-items: center; justify-content: center; color: #b4945a; margin-bottom: 2px;
  }
  .gc-ai-pill {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: #b4945a; background: rgba(180,148,90,0.1); border: 1px solid rgba(180,148,90,0.22);
    border-radius: 100px; padding: 3px 10px;
  }
  .gc-scan-title { font-size: 14px; font-weight: 600; color: #f0e8d8; text-align: center; }
  .gc-scan-hint {
    font-size: 11px; color: rgba(232,224,208,0.3);
    text-align: center; line-height: 1.65;
  }

  /* Image preview */
  .gc-preview-wrap {
    position: relative; margin-bottom: 12px;
    border-radius: 14px; overflow: hidden; border: 1px solid rgba(180,148,90,0.22);
  }
  .gc-preview-img { width: 100%; max-height: 200px; object-fit: cover; display: block; }
  .gc-preview-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(8,12,18,0.9) 0%, transparent 55%);
    display: flex; align-items: flex-end; padding: 12px 14px; gap: 8px;
  }
  .gc-preview-name {
    font-size: 11px; color: rgba(232,224,208,0.6);
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .gc-preview-clear {
    background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.25);
    border-radius: 7px; width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #f87171; transition: background 0.15s; flex-shrink: 0;
  }
  .gc-preview-clear:hover { background: rgba(248,113,113,0.28); }

  /* Scan action button */
  .gc-scan-btn {
    width: 100%; background: rgba(180,148,90,0.1); border: 1.5px solid rgba(180,148,90,0.35);
    border-radius: 13px; padding: 13px 16px;
    font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; color: #c9a96e;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
    margin-bottom: 16px; letter-spacing: 0.01em;
  }
  .gc-scan-btn:hover:not(:disabled) {
    background: rgba(180,148,90,0.18); border-color: rgba(180,148,90,0.65);
    transform: translateY(-1px); box-shadow: 0 4px 20px rgba(180,148,90,0.18);
  }
  .gc-scan-btn:active:not(:disabled) { transform: translateY(0); }
  .gc-scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .gc-spin { animation: spin 0.85s linear infinite; }

  /* Status banner */
  .gc-status {
    border-radius: 11px; padding: 11px 14px; font-size: 12px;
    display: flex; align-items: flex-start; gap: 9px;
    margin-bottom: 18px; line-height: 1.55;
  }
  .gc-status.success { background: rgba(74,222,128,0.07); border: 1px solid rgba(74,222,128,0.2); color: #86efac; }
  .gc-status.error   { background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.2); color: #fca5a5; }
  .gc-status-icon { flex-shrink: 0; margin-top: 1px; }

  /* Or divider */
  .gc-or { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  .gc-or-line { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
  .gc-or-text {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(232,224,208,0.22); white-space: nowrap;
  }

  /* Manual input */
  .gc-input-section { margin-bottom: 24px; }
  .gc-label-row {
    display: grid; grid-template-columns: 1fr 100px 48px;
    gap: 10px; margin-bottom: 6px; padding: 0 2px;
  }
  .gc-col-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(232,224,208,0.3);
  }
  .gc-input-row { display: grid; grid-template-columns: 1fr 100px 48px; gap: 10px; }
  .gc-input {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 13px 16px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; color: #f0e8d8;
    outline: none; transition: border-color 0.2s, background 0.2s, box-shadow 0.2s; width: 100%;
  }
  .gc-input::placeholder { color: rgba(232,224,208,0.18); }
  .gc-input:focus {
    border-color: rgba(180,148,90,0.6); background: rgba(180,148,90,0.06);
    box-shadow: 0 0 0 3px rgba(180,148,90,0.1);
  }
  .gc-confirm-btn {
    background: #b4945a; border: none; border-radius: 12px;
    width: 157px; height: 48px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #080c12;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s; flex-shrink: 0;
}
  .gc-confirm-btn:hover { background: #c9a96e; transform: scale(1.07); box-shadow: 0 4px 20px rgba(180,148,90,0.4); }
  .gc-confirm-btn:active { transform: scale(0.97); }
  .gc-add-btn {
    background: #b4945a; border: none; border-radius: 12px;
    width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #080c12;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s; flex-shrink: 0;
  }
  .gc-add-btn:hover { background: #c9a96e; transform: scale(1.07); box-shadow: 0 4px 20px rgba(180,148,90,0.4); }
  .gc-add-btn:active { transform: scale(0.97); }
  .gc-field-err {
    font-size: 12px; color: #f87171; margin-top: 8px;
    display: flex; align-items: center; gap: 5px;
  }

  /* Grade list */
  .gc-section-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 0 0 20px; }
  .gc-section-label {
    display: flex; align-items: center;
    font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: rgba(232,224,208,0.28); margin-bottom: 12px;
  }
  .gc-count-chip {
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(180,148,90,0.15); color: #b4945a;
    border-radius: 100px; font-size: 10px; font-weight: 700;
    width: 19px; height: 19px; margin-left: 7px;
  }
  .gc-list-header {
    display: grid; grid-template-columns: 1fr 90px 80px;
    gap: 10px; padding: 0 4px 10px; margin-bottom: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .gc-list-col {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: rgba(232,224,208,0.28);
  }
  .gc-list-col.right { text-align: right; }
  .gc-list {
    max-height: 290px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 8px; padding-right: 3px;
  }
  .gc-list::-webkit-scrollbar { width: 3px; }
  .gc-list::-webkit-scrollbar-track { background: transparent; }
  .gc-list::-webkit-scrollbar-thumb { background: rgba(180,148,90,0.3); border-radius: 3px; }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px) scale(0.99); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .gc-entry {
    display: grid; grid-template-columns: 1fr 90px 80px;
    gap: 10px; align-items: center;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px; padding: 11px 14px;
    animation: slideIn 0.22s cubic-bezier(0.16,1,0.3,1) forwards;
    transition: border-color 0.18s, background 0.18s;
  }
  .gc-entry:hover { background: rgba(180,148,90,0.05); border-color: rgba(180,148,90,0.18); }
  .gc-entry.ai { border-left: 2.5px solid rgba(180,148,90,0.5); background: rgba(180,148,90,0.04); }
  .gc-entry-grade {
    font-family: 'Fraunces', Georgia, serif; font-size: 20px; font-weight: 600;
    color: #f0e8d8; letter-spacing: -0.01em;
    display: flex; align-items: center; gap: 6px;
  }
  .gc-ai-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: #b4945a; flex-shrink: 0; opacity: 0.7;
  }
  .gc-entry-unit { font-size: 13px; color: rgba(232,224,208,0.5); }
  .gc-entry-actions { display: flex; gap: 6px; justify-content: flex-end; }
  .gc-icon-btn {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: rgba(232,224,208,0.4); transition: all 0.14s;
  }
  .gc-icon-btn:hover { color: #f0e8d8; background: rgba(255,255,255,0.1); }
  .gc-icon-btn.danger:hover { color: #f87171; background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.2); }
  .gc-icon-btn.confirm:hover { color: #4ade80; background: rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.2); }
  .gc-edit-input {
    background: rgba(180,148,90,0.08); border: 1px solid rgba(180,148,90,0.35);
    border-radius: 8px; padding: 5px 10px;
    font-family: 'Fraunces', Georgia, serif; font-size: 16px; font-weight: 600;
    color: #f0e8d8; outline: none; width: 100%;
  }
  .gc-edit-input-sm {
    background: rgba(180,148,90,0.08); border: 1px solid rgba(180,148,90,0.35);
    border-radius: 8px; padding: 5px 10px;
    font-family: 'DM Sans', sans-serif; font-size: 13px;
    color: rgba(232,224,208,0.9); outline: none; width: 100%;
  }
  .gc-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px; padding: 36px 20px; color: rgba(232,224,208,0.2);
  }
  .gc-empty-icon {
    width: 46px; height: 46px; border: 1px dashed rgba(180,148,90,0.2);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: rgba(180,148,90,0.3);
  }
  .gc-empty p { font-size: 13px; }

  /* Calculate button */
  .gc-calc-btn {
    width: 100%; background: linear-gradient(135deg, #b4945a 0%, #c9a96e 100%);
    border: none; border-radius: 14px; padding: 15px;
    font-family: 'Fraunces', Georgia, serif; font-size: 17px; font-weight: 600;
    color: #080c12; cursor: pointer;
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
    letter-spacing: -0.01em; margin-top: 20px;
  }
  .gc-calc-btn:hover:not(:disabled) {
    opacity: 0.9; transform: translateY(-1px); box-shadow: 0 8px 32px rgba(180,148,90,0.38);
  }
  .gc-calc-btn:active:not(:disabled) { transform: translateY(0); }
  .gc-calc-btn:disabled { opacity: 0.25; cursor: not-allowed; }

  /* Result */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .gc-result {
    width: 100%; max-width: 520px; margin-top: 16px;
    background: rgba(180,148,90,0.07); border: 1px solid rgba(180,148,90,0.25);
    border-radius: 20px; padding: 34px 28px 28px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards;
  }
  .gc-result-eyebrow {
    font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: rgba(180,148,90,0.65); margin-bottom: 6px;
  }
  .gc-result-gpa {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(58px, 14vw, 88px); font-weight: 700;
    line-height: 1; letter-spacing: -0.03em; color: #f0e8d8;
  }
  .gc-result-remark {
    font-size: 13px; font-weight: 600; margin-top: 12px;
    padding: 5px 16px; border-radius: 100px;
    background: rgba(180,148,90,0.1); border: 1px solid rgba(180,148,90,0.18);
  }
  .gc-result-meta { margin-top: 8px; font-size: 12px; color: rgba(232,224,208,0.3); }
`;

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
    if (gNum < 1.0 || gNum > 4.0) return "Grade must be between 1.0 and .0.";
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

      // FIX 1: Strip the "data:image/png;base64," prefix if it exists!
      // Gemini API strictly expects ONLY the raw base64 string.
      const base64 = rawBase64.includes(",")
        ? rawBase64.split(",")[1]
        : rawBase64;

      const mediaType = imageFile.type as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp";

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apikey}`,
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
      console.log("Full API Response:", data); // DEBUG LOG 1

      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
      console.log("Extracted AI Text:", raw); // DEBUG LOG 2

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
        msg:
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setScanning(false);
    }
  };

  const remark = gpa ? getGPARemark(parseFloat(gpa)) : null;

  /* ================================================================
     RENDER
  ================================================================ */
  return (
    <div className="gc-root">
      <style>{STYLES}</style>

      {/* Header */}
      <header className="gc-header">
        <div className="gc-badge">
          <GraduationCap size={12} /> UMDC GRADING SYSTEM
        </div>
        <h1 className="gc-title">
          Grade
          <br />
          <em>Calculator</em>
        </h1>
        <p className="gc-subtitle">Weighted GPA · 4.0 highest · 1.0 failing</p>
      </header>

      <div className="gc-card">
        {/* ── AI Scan zone ── */}
        {!imagePreview ? (
          <div
            className={`gc-scan-zone${dragOver ? " drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
            />
            <div className="gc-scan-icon">
              <ImageUp size={22} />
            </div>
            <span className="gc-ai-pill">
              <Sparkles size={9} /> AI Powered
            </span>
            <span className="gc-scan-title">Upload your grade screenshot</span>
            <span className="gc-scan-hint">
              Drag & drop or click to browse
              <br />
              CRS · SAIS · MyUSTe · report cards · transcripts
            </span>
          </div>
        ) : (
          <>
            <div className="gc-preview-wrap">
              <img
                src={imagePreview}
                className="gc-preview-img"
                alt="Grade screenshot"
              />
              <div className="gc-preview-overlay">
                <span className="gc-preview-name">{imageFile?.name}</span>
                <button className="gc-preview-clear" onClick={clearImage}>
                  <X size={13} />
                </button>
              </div>
            </div>
            <button
              className="gc-scan-btn"
              onClick={scanImage}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 size={15} className="gc-spin" /> Reading your grades…
                </>
              ) : (
                <>
                  <ScanLine size={15} /> Scan &amp; Auto-Calculate
                </>
              )}
            </button>
          </>
        )}



        {/* Status banner */}
        {scanStatus && (
          <div className={`gc-status ${scanStatus.type}`}>
            <span className="gc-status-icon">
              {scanStatus.type === "success" ? (
                <Check size={14} />
              ) : (
                <AlertCircle size={14} />
              )}
            </span>
            <span>{scanStatus.msg}</span>
          </div>
        )}

        {/* Or divider */}
        <div className="gc-or">
          <div className="gc-or-line" />
          <span className="gc-or-text">or enter manually</span>
          <div className="gc-or-line" />
        </div>

        {/* ── Manual input ── */}
        <div className="gc-input-section">
          <div className="gc-label-row">
            <span className="gc-col-label">API KEY</span>
          </div>
          <div className="gc-input-row">
            <input
              className="gc-input"
              type="text"
              placeholder="e.g. Alza..."
              value={apikey}
              onChange={(e) => {
                setApiKey(e.target.value);
              }}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
            <button
            className="gc-confirm-btn"
            onClick={() => setApiKey(apikey)}>Confirm</button>
          </div>
          <div className="gc-label-row">
            <span className="gc-col-label">Subject Grade</span>
            <span className="gc-col-label">Units</span>
            <span />
          </div>
          <div className="gc-input-row">
            <input
              className="gc-input"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1.75"
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setFieldError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
            <input
              className="gc-input"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 3"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setFieldError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && addToList()}
            />
            <button
              className="gc-add-btn"
              onClick={addToList}
              title="Add subject"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
          {fieldError && (
            <div className="gc-field-err">
              <X size={12} /> {fieldError}
            </div>
          )}
        </div>

        <div className="gc-section-divider" />

        {/* ── Grade list ── */}
        <div className="gc-section-label">
          Subjects
          {gradeList.length > 0 && (
            <span className="gc-count-chip">{gradeList.length}</span>
          )}
        </div>

        {gradeList.length > 0 && (
          <div className="gc-list-header">
            <span className="gc-list-col">Grade</span>
            <span className="gc-list-col">Units</span>
            <span className="gc-list-col right">Actions</span>
          </div>
        )}

        <div className="gc-list">
          {gradeList.length === 0 ? (
            <div className="gc-empty">
              <div className="gc-empty-icon">
                <BookOpen size={20} />
              </div>
              <p>No subjects added yet.</p>
              <p style={{ fontSize: 11, opacity: 0.5 }}>
                Upload a screenshot or enter grades manually
              </p>
            </div>
          ) : (
            gradeList.map((item) => (
              <div
                key={item.id}
                className={`gc-entry${item.fromAI ? " ai" : ""}`}
              >
                {/* Grade */}
                <div>
                  {editingId === item.id ? (
                    <input
                      className="gc-edit-input"
                      value={editGrade}
                      autoFocus
                      onChange={(e) => setEditGrade(e.target.value)}
                    />
                  ) : (
                    <span className="gc-entry-grade">
                      {item.grade.toFixed(2)}
                      {item.fromAI && (
                        <span className="gc-ai-dot" title="AI scanned" />
                      )}
                    </span>
                  )}
                </div>

                {/* Unit */}
                <div>
                  {editingId === item.id ? (
                    <input
                      className="gc-edit-input-sm"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                    />
                  ) : (
                    <span className="gc-entry-unit">
                      {item.unit} {item.unit === 1 ? "unit" : "units"}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="gc-entry-actions">
                  {editingId === item.id ? (
                    <>
                      <button
                        className="gc-icon-btn confirm"
                        onClick={() => confirmEdit(item.id)}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        className="gc-icon-btn danger"
                        onClick={cancelEdit}
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="gc-icon-btn"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="gc-icon-btn danger"
                        onClick={() => removeFromList(item.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Calculate */}
        <button
          className="gc-calc-btn"
          onClick={() => calculateGPA()}
          disabled={gradeList.length === 0}
        >
          Calculate GPA
        </button>
      </div>

      {/* ── Result ── */}
      {gpa && remark && (
        <div className="gc-result">
          <span className="gc-result-eyebrow">Your Weighted GPA</span>
          <span className="gc-result-gpa">{gpa}</span>
          <span
            className="gc-result-remark"
            style={{ color: remark.color, borderColor: `${remark.color}30` }}
          >
            {remark.label}
          </span>
          <span className="gc-result-meta">
            {gradeList.length} subject{gradeList.length !== 1 ? "s" : ""} ·{" "}
            {gradeList.reduce((s, i) => s + i.unit, 0)} total units
          </span>
        </div>
      )}
    </div>
  );
}
