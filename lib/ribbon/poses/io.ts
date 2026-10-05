/** Typed (de)serialisation of pose files: tolerant loader, compact formatter. */
import {
  SCREEN_CLASSES,
  type PoseFile,
  type PosePoint,
  type PoseVariant,
  type ScreenClass,
} from "./types";

const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

export function parsePoint(raw: unknown): PosePoint {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    x: num(r.x, 0),
    y: num(r.y, 0),
    z: num(r.z, 0),
    twist: num(r.twist, 0),
    width: num(r.width, 1),
  };
}

/** Validate / normalise untrusted JSON into a PoseFile (throws on an unusable file). */
export function parsePoseFile(raw: unknown): PoseFile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const variants: PoseFile["variants"] = {};
  const rv = (r.variants ?? {}) as Record<string, unknown>;
  for (const cls of SCREEN_CLASSES) {
    const v = rv[cls] as { points?: unknown } | undefined;
    if (!v || !Array.isArray(v.points)) continue;
    const points = v.points.map(parsePoint);
    if (points.length >= 2) variants[cls] = { points };
  }
  if (Object.keys(variants).length === 0) throw new Error("pose file has no usable variant");
  return {
    version: 1,
    name: typeof r.name === "string" && r.name ? r.name : "untitled",
    anchor: typeof r.anchor === "string" && r.anchor ? r.anchor : "hero-name",
    ...(typeof r.notes === "string" ? { notes: r.notes } : {}),
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
  out.push(`  "variants": {`);
  const classes = SCREEN_CLASSES.filter((c): c is ScreenClass => !!file.variants[c]);
  classes.forEach((cls, ci) => {
    const v = file.variants[cls] as PoseVariant;
    out.push(`    ${JSON.stringify(cls)}: {`);
    out.push(`      "points": [`);
    v.points.forEach((p, i) => {
      out.push(
        `        { "x": ${r4(p.x)}, "y": ${r4(p.y)}, "z": ${r4(p.z)}, "twist": ${r4(p.twist)}, "width": ${r4(p.width)} }${i < v.points.length - 1 ? "," : ""}`,
      );
    });
    out.push(`      ]`);
    out.push(`    }${ci < classes.length - 1 ? "," : ""}`);
  });
  out.push(`  }`);
  out.push("}");
  return out.join("\n") + "\n";
}
