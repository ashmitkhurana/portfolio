/** Typed (de)serialisation of pose files: tolerant loader, compact formatter. */
import { DEFAULT_FOLD_ANGLE, DEFAULT_FOLD_RADIUS } from "../fold";
import {
  SCREEN_CLASSES,
  type PoseFile,
  type PosePoint,
  type PoseVariant,
  type ScreenClass,
} from "./types";

const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

function parseSpans(raw: unknown): NonNullable<PoseVariant["spans"]> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<PoseVariant["spans"]> = [];
  for (const s of raw as Record<string, unknown>[]) {
    if (!s || typeof s !== "object" || !Array.isArray(s.rolls)) continue;
    const from = Math.round(num(s.from, -1));
    const to = Math.round(num(s.to, -1));
    if (from < 0 || to <= from) continue;
    const rolls = (s.rolls as Record<string, unknown>[]).map((r) => ({
      u: num(r?.u, 0),
      beta: num(r?.beta, Math.PI / 2),
      rho: num(r?.rho, 20),
      phi: num(r?.phi, 0),
    }));
    out.push({ from, to, rolls, ...(typeof s.name === "string" ? { name: s.name } : {}) });
  }
  return out;
}

export function parsePoint(raw: unknown): PosePoint {
  const r = (raw ?? {}) as Record<string, unknown>;
  const f = r.fold as Record<string, unknown> | undefined | null;
  const h = r.hairpin as Record<string, unknown> | undefined | null;
  return {
    x: num(r.x, 0),
    y: num(r.y, 0),
    z: num(r.z, 0),
    twist: num(r.twist, 0),
    width: num(r.width, 1),
    ...(f && typeof f === "object"
      ? {
          fold: {
            angle: num(f.angle, DEFAULT_FOLD_ANGLE),
            radius: num(f.radius, DEFAULT_FOLD_RADIUS),
            ...(typeof f.name === "string" ? { name: f.name } : {}),
          },
        }
      : {}),
    ...(h && typeof h === "object" ? { hairpin: { name: typeof h.name === "string" ? h.name : "hairpin", radius: num(h.radius, 1) } } : {}),
  };
}

/** Validate / normalise untrusted JSON into a PoseFile (throws on an unusable file). */
export function parsePoseFile(raw: unknown): PoseFile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const variants: PoseFile["variants"] = {};
  const rv = (r.variants ?? {}) as Record<string, unknown>;
  for (const cls of SCREEN_CLASSES) {
    const v = rv[cls] as { points?: unknown; spline?: unknown; ruled?: unknown; faceSign?: unknown; spans?: unknown } | undefined;
    if (!v) continue;
    if (Array.isArray(v.ruled) && v.ruled.length >= 2) {
      const tri = (a: unknown): [number, number, number] => {
        const q = (Array.isArray(a) ? a : []) as unknown[];
        return [num(q[0], 0), num(q[1], 0), num(q[2], 0)];
      };
      const ruled = v.ruled.map((r) => ({ L: tri((r as { L?: unknown }).L), R: tri((r as { R?: unknown }).R) }));
      variants[cls] = { points: [], ruled, faceSign: v.faceSign === -1 ? -1 : 1 };
      continue;
    }
    if (!Array.isArray(v.points)) continue;
    const points = v.points.map(parsePoint);
    const spans = parseSpans(v.spans);
    if (points.length >= 2)
      variants[cls] = {
        points,
        ...(v.spline === "bspline" ? { spline: "bspline" as const } : {}),
        ...(spans.length ? { spans } : {}),
      };
  }
  if (Object.keys(variants).length === 0) throw new Error("pose file has no usable variant");
  return {
    version: 1,
    name: typeof r.name === "string" && r.name ? r.name : "untitled",
    anchor: typeof r.anchor === "string" && r.anchor ? r.anchor : "hero-name",
    ...(typeof r.notes === "string" ? { notes: r.notes } : {}),
    orientation: r.orientation === "rmf" ? "rmf" : "curvature",
    variants,
  };
}

const r4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/** One control point per line (readable diffs). */
export function formatPoseJson(file: PoseFile): string {
  const out: string[] = ["{"];
  out.push(`  "version": 1,`);
  out.push(`  "name": ${JSON.stringify(file.name)},`);
  out.push(`  "anchor": ${JSON.stringify(file.anchor)},`);
  if (file.notes) out.push(`  "notes": ${JSON.stringify(file.notes)},`);
  out.push(`  "orientation": ${JSON.stringify(file.orientation ?? "curvature")},`);
  out.push(`  "variants": {`);
  const classes = SCREEN_CLASSES.filter((c): c is ScreenClass => !!file.variants[c]);
  classes.forEach((cls, ci) => {
    const v = file.variants[cls] as PoseVariant;
    out.push(`    ${JSON.stringify(cls)}: {`);
    if (v.ruled) {
      out.push(`      "faceSign": ${v.faceSign === -1 ? -1 : 1},`);
      out.push(`      "ruled": [`);
      v.ruled.forEach((r, i) => {
        const t3 = (a: [number, number, number]) => `[${r4(a[0])}, ${r4(a[1])}, ${r4(a[2])}]`;
        out.push(`        { "L": ${t3(r.L)}, "R": ${t3(r.R)} }${i < v.ruled!.length - 1 ? "," : ""}`);
      });
      out.push(`      ]`);
      out.push(`    }${ci < classes.length - 1 ? "," : ""}`);
      return;
    }
    if (v.spline === "bspline") out.push(`      "spline": "bspline",`);
    if (v.spans?.length) {
      out.push(`      "spans": [`);
      v.spans.forEach((s, i) => {
        const rolls = s.rolls.map((r) => `{ "u": ${r4(r.u)}, "beta": ${r4(r.beta)}, "rho": ${r4(r.rho)}, "phi": ${r4(r.phi)} }`).join(", ");
        out.push(
          `        { "from": ${s.from}, "to": ${s.to}${s.name ? `, "name": ${JSON.stringify(s.name)}` : ""}, "rolls": [${rolls}] }${i < v.spans!.length - 1 ? "," : ""}`,
        );
      });
      out.push(`      ],`);
    }
    out.push(`      "points": [`);
    v.points.forEach((p, i) => {
      const fold = p.fold
        ? `, "fold": { "angle": ${r4(p.fold.angle)}, "radius": ${r4(p.fold.radius)}${p.fold.name ? `, "name": ${JSON.stringify(p.fold.name)}` : ""} }`
        : "";
      const hp = p.hairpin ? `, "hairpin": { "name": ${JSON.stringify(p.hairpin.name)}, "radius": ${r4(p.hairpin.radius)} }` : "";
      out.push(
        `        { "x": ${r4(p.x)}, "y": ${r4(p.y)}, "z": ${r4(p.z)}, "twist": ${r4(p.twist)}, "width": ${r4(p.width)}${fold}${hp} }${i < v.points.length - 1 ? "," : ""}`,
      );
    });
    out.push(`      ]`);
    out.push(`    }${ci < classes.length - 1 ? "," : ""}`);
  });
  out.push(`  }`);
  out.push("}");
  return out.join("\n") + "\n";
}
