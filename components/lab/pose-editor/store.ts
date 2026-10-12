/**
 * Editor state: the pose file being edited, which frame (screen class) is shown,
 * the selection, and undo / redo. A tiny external store (useSyncExternalStore).
 */
import { DEFAULT_FOLD_ANGLE, DEFAULT_FOLD_RADIUS } from "@/lib/ribbon/fold";
import { formatPoseJson } from "@/lib/ribbon/poses/io";
import { screenClassFor, variantFor, MAX_POSE_POINTS } from "@/lib/ribbon/poses/resolve";
import type { PoseFile, PosePoint, ScreenClass } from "@/lib/ribbon/poses/types";

export interface FramePreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const FRAME_PRESETS: FramePreset[] = [
  { id: "desktop", label: "Desktop", w: 1440, h: 900 },
  { id: "tablet", label: "Tablet", w: 820, h: 1180 },
  { id: "phone", label: "Phone", w: 390, h: 844 },
  { id: "ultrawide", label: "Ultrawide", w: 2560, h: 1080 },
];

export interface EditorState {
  poseName: string;
  file: PoseFile;
  frame: { id: string; w: number; h: number };
  selection: number[];
  /** JSON of the last saved / loaded file (dirty check) */
  savedJson: string;
  canUndo: boolean;
  canRedo: boolean;
  /** bumps on every pose change (cheap change detection) */
  version: number;
}

interface Snapshot {
  file: PoseFile;
  selection: number[];
}

const HISTORY_LIMIT = 200;

export const clonePoint = (p: PosePoint): PosePoint => ({ ...p });

export class PoseEditorStore {
  private state: EditorState;
  private listeners = new Set<() => void>();
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private lastKey = "";
  private lastAt = 0;

  constructor(file: PoseFile) {
    this.state = {
      poseName: file.name,
      file,
      frame: { id: "desktop", w: 1440, h: 900 },
      selection: [],
      savedJson: formatPoseJson(file),
      canUndo: false,
      canRedo: false,
      version: 0,
    };
  }

  // ---- subscription -----------------------------------------------------
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;
  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ---- derived ----------------------------------------------------------
  get cls(): ScreenClass {
    return screenClassFor(this.state.frame.w);
  }

  /** the variant shown for the current frame, plus whether it is derived (no override stored) */
  current(): { points: PosePoint[]; source: ScreenClass; derived: boolean } {
    const { file, frame } = this.state;
    const pick = variantFor(file, this.cls, frame.h > frame.w);
    return { points: pick.variant?.points ?? [], source: pick.source, derived: pick.derived };
  }

  isDirty(): boolean {
    return formatPoseJson(this.state.file) !== this.state.savedJson;
  }

  // ---- loading ----------------------------------------------------------
  load(file: PoseFile, markSaved = true) {
    this.past = [];
    this.future = [];
    this.set({
      file,
      poseName: file.name,
      selection: [],
      savedJson: markSaved ? formatPoseJson(file) : this.state.savedJson,
      canUndo: false,
      canRedo: false,
      version: this.state.version + 1,
    });
  }

  markSaved() {
    this.set({ savedJson: formatPoseJson(this.state.file) });
  }

  setFrame(f: { id: string; w: number; h: number }) {
    this.set({ frame: f, selection: [] });
  }

  // ---- selection --------------------------------------------------------
  select(ids: number[]) {
    const n = this.current().points.length;
    const next = Array.from(new Set(ids.filter((i) => i >= 0 && i < n))).sort((a, b) => a - b);
    const cur = this.state.selection;
    if (next.length === cur.length && next.every((v, i) => v === cur[i])) return;
    this.set({ selection: next });
  }

  toggle(i: number) {
    const s = new Set(this.state.selection);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    this.select([...s]);
  }

  // ---- editing ----------------------------------------------------------
  private snapshot(): Snapshot {
    return { file: this.state.file, selection: this.state.selection };
  }

  /** push the current state to the undo stack (coalescing rapid edits with the same key) */
  private pushHistory(key?: string) {
    const now = performance.now();
    if (key && key === this.lastKey && now - this.lastAt < 600) {
      this.lastAt = now;
      return;
    }
    this.lastKey = key ?? "";
    this.lastAt = now;
    this.past.push(this.snapshot());
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  /** start a continuous edit (a drag): one history entry for the whole gesture */
  beginGesture() {
    this.lastKey = "";
    this.pushHistory();
    this.lastKey = "";
  }

  /**
   * Replace the points of the current frame's class (creating the override when
   * it was derived). `gesture` edits skip history (beginGesture already pushed it).
   */
  setPoints(points: PosePoint[], opts: { key?: string; gesture?: boolean; selection?: number[] } = {}) {
    if (!opts.gesture) this.pushHistory(opts.key);
    const cls = this.cls;
    const file: PoseFile = {
      ...this.state.file,
      variants: { ...this.state.file.variants, [cls]: { points } },
    };
    const patch: Partial<EditorState> = { file, version: this.state.version + 1 };
    if (opts.selection) patch.selection = opts.selection;
    this.set({
      ...patch,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    });
  }

  /** apply `fn` to the selected points (immutably) */
  editSelected(fn: (p: PosePoint, i: number) => PosePoint, key?: string) {
    const sel = new Set(this.state.selection);
    if (!sel.size) return;
    const pts = this.current().points.map((p, i) => (sel.has(i) ? fn(p, i) : p));
    this.setPoints(pts, { key });
  }

  insertAfter(i: number, p: PosePoint) {
    const pts = this.current().points.slice();
    if (pts.length >= MAX_POSE_POINTS) return;
    pts.splice(i + 1, 0, p);
    this.setPoints(pts, { selection: [i + 1] });
  }

  deleteSelected() {
    const sel = new Set(this.state.selection);
    const pts = this.current().points;
    if (!sel.size || pts.length - sel.size < 4) return;
    const next = pts.filter((_, i) => !sel.has(i));
    this.setPoints(next, { selection: [] });
  }

  /**
   * Toggle the selected points as soft FOLDS (the strip rolls over itself there). With a mixed selection every
   * point becomes a fold; when all are folds they are cleared.
   */
  toggleFold() {
    const sel = new Set(this.state.selection);
    const pts = this.current().points;
    if (!sel.size) return;
    const allFold = [...sel].every((i) => pts[i]?.fold);
    this.editSelected((p) => {
      if (allFold) {
        const rest = { ...p };
        delete rest.fold;
        return rest;
      }
      return { ...p, fold: p.fold ?? { angle: DEFAULT_FOLD_ANGLE, radius: DEFAULT_FOLD_RADIUS } };
    }, "fold");
  }

  /** edit the fold parameters of the selected fold points */
  setFold(patch: Partial<NonNullable<PosePoint["fold"]>>, key: string) {
    this.editSelected(
      (p) => (p.fold ? { ...p, fold: { ...p.fold, ...patch } } : p),
      `fold-${key}`,
    );
  }

  /** frame mode of the whole pose (twist is a roll relative to it) */
  setOrientation(o: "curvature" | "rmf") {
    if ((this.state.file.orientation ?? "curvature") === o) return;
    this.pushHistory();
    this.set({
      file: { ...this.state.file, orientation: o },
      version: this.state.version + 1,
      canUndo: true,
      canRedo: false,
    });
  }

  /** copy the derived points into an explicit override for this class */
  createOverride() {
    const cur = this.current();
    if (!cur.derived) return;
    this.setPoints(cur.points.map(clonePoint));
  }

  /** drop the override of this class (falls back to the derived variant) */
  removeOverride() {
    const cls = this.cls;
    if (!this.state.file.variants[cls]) return;
    const rest = { ...this.state.file.variants };
    delete rest[cls];
    if (!Object.keys(rest).length) return;
    this.pushHistory();
    this.set({
      file: { ...this.state.file, variants: rest },
      selection: [],
      version: this.state.version + 1,
      canUndo: true,
      canRedo: false,
    });
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.snapshot());
    this.lastKey = "";
    this.set({
      file: prev.file,
      selection: prev.selection,
      version: this.state.version + 1,
      canUndo: this.past.length > 0,
      canRedo: true,
    });
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot());
    this.lastKey = "";
    this.set({
      file: next.file,
      selection: next.selection,
      version: this.state.version + 1,
      canUndo: true,
      canRedo: this.future.length > 0,
    });
  }
}
