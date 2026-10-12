import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Dev-only pose persistence for /lab/editor. Refuses unless NODE_ENV is
 * "development" or NEXT_PUBLIC_LAB=1 (a local production build used for perf work).
 *
 *   GET  /api/lab/poses            -> { names: string[] }
 *   GET  /api/lab/poses?name=x     -> the pose JSON (lib/ribbon/poses/x.json)
 *   POST /api/lab/poses {name,json} -> writes lib/ribbon/poses/<name>.json
 */
export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "lib", "ribbon", "poses");
const NAME = /^[a-z0-9][a-z0-9-]{0,48}$/;

function allowed(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_LAB === "1";
}

const refuse = () => NextResponse.json({ error: "pose editing is disabled" }, { status: 403 });

export async function GET(req: Request) {
  if (!allowed()) return refuse();
  const name = new URL(req.url).searchParams.get("name");
  if (!name) {
    const files = await fs.readdir(DIR);
    const names = files
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .map((f) => f.slice(0, -5))
      .filter((n) => NAME.test(n))
      .sort();
    return NextResponse.json({ names });
  }
  if (!NAME.test(name)) return NextResponse.json({ error: "bad name" }, { status: 400 });
  try {
    const text = await fs.readFile(path.join(DIR, `${name}.json`), "utf8");
    return new NextResponse(text, { headers: { "content-type": "application/json" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function POST(req: Request) {
  if (!allowed()) return refuse();
  let body: { name?: unknown; json?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  if (!NAME.test(name)) return NextResponse.json({ error: "bad name" }, { status: 400 });
  if (typeof body.json !== "string") return NextResponse.json({ error: "json must be a string" }, { status: 400 });
  try {
    const parsed = JSON.parse(body.json) as { version?: unknown; variants?: unknown };
    if (parsed.version !== 1 || typeof parsed.variants !== "object") throw new Error("not a pose file");
  } catch (err) {
    return NextResponse.json({ error: `invalid pose file: ${(err as Error).message}` }, { status: 400 });
  }
  await fs.writeFile(path.join(DIR, `${name}.json`), body.json, "utf8");
  return NextResponse.json({ ok: true, path: `lib/ribbon/poses/${name}.json` });
}
