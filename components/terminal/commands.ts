/**
 * Terminal content + completion helpers. Pure data/logic, no React.
 * Copy comes from data/site-content.ts and data/projects.ts (single source of truth).
 */
import {
  about,
  contact,
  experience,
  identity,
  resume,
  skills,
  socials,
} from "@/data/site-content";
import { projects } from "@/data/projects";

export type Tone = "accent" | "muted" | "head";

export type Line =
  | string
  | { text: string; href?: string; tone?: Tone }
  | { cmd: string; desc: string };

export interface Entry {
  id: number;
  /** the command the user typed (rendered after the prompt); absent for system messages */
  cmd?: string;
  lines: Line[];
  tone?: "error" | "warn" | "ok";
}

export const PROMPT = "ashmit@portfolio:~$";

export const GOTO_TARGETS = {
  home: "hero",
  work: "work",
  build: "build",
  terminal: "terminal",
  contact: "contact",
} as const;
export type GotoTarget = keyof typeof GOTO_TARGETS;
export const GOTO_NAMES = Object.keys(GOTO_TARGETS) as GotoTarget[];

export const TOP_LEVEL = [
  "help",
  "about",
  "contact",
  "ls",
  "cat",
  "goto",
  "pages",
  "sudo",
  "hack",
  "nuke",
  "download",
  "clear",
  "exit",
] as const;

const SECOND_LEVEL: Record<string, string[]> = {
  ls: ["skills/", "projects/"],
  sudo: ["ask-me-anything"],
  download: ["resume"],
  nuke: ["confirm"],
};

export const FILES: Record<string, Line[]> = (() => {
  const files: Record<string, Line[]> = {};
  const current = experience.find((e) => e.company === "Alpha Block");

  files["about.txt"] = [
    { text: `${identity.name} — ${identity.role}`, tone: "head" },
    identity.tagline,
    "",
    about.lede,
    "",
    ...about.paragraphs.flatMap((p) => [p, ""]),
    ...(current
      ? [`Now: ${current.role} at ${current.company} (${current.period}).`]
      : []),
  ];

  files["contact.txt"] = contactLines();

  files["skills.txt"] = skills.flatMap((g) => [
    { text: g.label, tone: "head" as const },
    ...g.skills.map((s) => `  ${s}`),
    "",
  ]);

  for (const p of projects) {
    files[`${p.slug}.txt`] = [
      { text: p.title, tone: "head" },
      p.tagline,
      "",
      { text: "Problem", tone: "accent" },
      p.problem,
      "",
      { text: "Solution", tone: "accent" },
      p.solution,
      "",
      { text: "Impact", tone: "accent" },
      ...p.impact.map((i) => `  - ${i}`),
      "",
      { text: "Stack", tone: "accent" },
      `  ${p.stack.join(", ")}`,
      ...(p.liveUrl ? ["", { text: p.liveUrl, href: p.liveUrl }] : []),
      ...(p.githubUrl ? ["", { text: p.githubUrl, href: p.githubUrl }] : []),
    ];
  }
  return files;
})();

export const FILE_NAMES = Object.keys(FILES);

export function contactLines(): Line[] {
  const rows: Line[] = [
    { text: `Email     ${identity.email}`, href: `mailto:${identity.email}` },
  ];
  for (const s of socials) {
    rows.push({ text: `${s.label.padEnd(9)} ${s.href.replace(/^https?:\/\//, "")}`, href: s.href });
  }
  rows.push(`Location  ${identity.location}`, "", contact.copy);
  return rows;
}

export function aboutLines(): Line[] {
  const current = experience.find((e) => e.company === "Alpha Block");
  return [
    { text: `${identity.name} — ${identity.role}`, tone: "head" },
    identity.tagline,
    "",
    about.paragraphs[0],
    "",
    ...(current
      ? [`Now: ${current.role} at ${current.company} (${current.period}).`]
      : []),
    { text: "Try 'cat about.txt' for more.", tone: "muted" },
  ];
}

export const HELP_LINES: Line[] = [
  { text: "Commands", tone: "head" },
  { cmd: "help", desc: "show this menu" },
  { cmd: "about", desc: "who I am" },
  { cmd: "contact", desc: "how to reach me" },
  { cmd: "ls [skills/|projects/]", desc: "list files and folders" },
  { cmd: "cat <file>", desc: "read a file (see ls)" },
  { cmd: "goto <section>", desc: "home, work, build, terminal, contact" },
  { cmd: "pages", desc: "list site routes" },
  { cmd: "download resume", desc: "download my resume (PDF)" },
  { cmd: "clear", desc: "clear the screen" },
  { cmd: "exit", desc: "close the terminal overlay" },
  "",
  { text: "Fun", tone: "head" },
  { cmd: "sudo ask-me-anything", desc: "a random fact" },
  { cmd: "hack", desc: "try it and see" },
  { cmd: "nuke", desc: "do not press (asks first)" },
  "",
  { text: "Up/Down for history, Tab to complete.", tone: "muted" },
];

export const FUN_FACTS: string[] = [
  `I cut page load times by 25% at Bruxford Digital.`,
  `Alpha Block processes 100+ on-chain transactions a day, with sub-second Telegram alerts.`,
  `I have a B.Tech in Computer Science & Engineering (AI & Machine Learning).`,
  `I like two things most teams treat as afterthoughts: performance and real-time data.`,
  `This ribbon is one continuous 3D strip, woven in front of and behind the page.`,
];

export function lsRoot(): Line[] {
  return [
    "skills/",
    "projects/",
    ...["about.txt", "contact.txt", "skills.txt"],
  ];
}

export function lsSkills(): Line[] {
  return skills.map((g) => `${g.label}: ${g.skills.join(", ")}`);
}

export function lsProjects(): Line[] {
  return projects.map((p) => `${p.slug}.txt  ${p.kind}`);
}

export function pagesLines(): Line[] {
  return [
    { text: "/", href: "/" },
    { text: "/work", href: "/work" },
    ...projects.map((p) => ({ text: `/work/${p.slug}`, href: `/work/${p.slug}` })),
    { text: "/about", href: "/about" },
  ];
}

export const RESUME = resume;

/** Resolve a `cat` operand to a file key, tolerating a `projects/` prefix and a missing `.txt`. */
export function resolveFile(arg: string): string | null {
  let name = arg.toLowerCase().replace(/^\.?\/?(projects|skills)\//, "");
  if (FILES[name]) return name;
  if (!name.endsWith(".txt")) name += ".txt";
  return FILES[name] ? name : null;
}

export interface Completion {
  value: string;
  /** more than one candidate and nothing further to add: show these */
  candidates: string[];
}

function commonPrefix(items: string[]): string {
  let p = items[0] ?? "";
  for (const s of items) {
    while (!s.startsWith(p)) p = p.slice(0, -1);
  }
  return p;
}

/** Tab completion over commands, second-level words, `cat` files and `goto` targets. */
export function complete(input: string): Completion | null {
  const m = input.match(/^(\s*)(\S*)(\s+)?(.*)$/);
  if (!m) return null;
  const [, lead, first, gap, rest] = m;
  const pick = (stem: string, options: string[], build: (v: string) => string, sp: boolean) => {
    const matches = options.filter((o) => o.startsWith(stem.toLowerCase()));
    if (matches.length === 0) return null;
    if (matches.length === 1) {
      return { value: build(matches[0]) + (sp ? " " : ""), candidates: [] };
    }
    const cp = commonPrefix(matches);
    return { value: build(cp), candidates: cp === stem.toLowerCase() ? matches : [] };
  };

  if (!gap) {
    if (!first) return null;
    return pick(first, [...TOP_LEVEL], (v) => lead + v, true);
  }

  // second token
  if (rest.includes(" ")) return null;
  const cmd = first.toLowerCase();
  const prefix = `${lead}${first}${gap}`;
  if (cmd === "cat") {
    const options = [...FILE_NAMES];
    return pick(rest, options, (v) => prefix + v, false);
  }
  if (cmd === "goto") {
    return pick(rest, GOTO_NAMES, (v) => prefix + v, false);
  }
  const opts = SECOND_LEVEL[cmd];
  if (opts) return pick(rest, opts, (v) => prefix + v, false);
  return null;
}
