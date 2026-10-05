/**
 * Single source of truth for all site copy. Pages and sections import from here;
 * nothing else should hard-code identity, links or narrative text.
 *
 * Provenance: identity/links/experience from the live site (`main`), narrative
 * (about, philosophy, contact) from the `refresh-portfolio-with-flowing-ribbon`
 * branch, project data from `./projects`.
 */
import { projects, type Project } from "./projects";

export type { Project };

export interface NavItem {
  label: string;
  href: string;
}

export interface SocialLink {
  label: string;
  href: string;
}

export interface ExperienceEntry {
  company: string;
  role: string;
  period: string;
  type: string;
  url: string;
  highlights: string[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface SkillGroup {
  label: string;
  skills: string[];
}

export interface Principle {
  number: string;
  title: string;
  text: string;
}

export const identity = {
  name: "Ashmit Khurana",
  /** display lines for the hero h1 */
  nameLines: ["ASHMIT", "KHURANA"] as const,
  role: "Full-Stack Developer",
  tagline: "Building across interfaces, systems, and AI.",
  domain: "ashmitkhurana.com",
  url: "https://ashmitkhurana.com",
  email: "itsme@ashmitkhurana.com",
  location: "Greater Noida, India",
  year: 2026,
} as const;

export const resume = {
  href: "/AshmitKhuranaResume.pdf",
  label: "Download resume",
  filename: "AshmitKhuranaResume.pdf",
} as const;

export const socials: SocialLink[] = [
  { label: "GitHub", href: "https://github.com/ashmitkhurana" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/ashmitkhurana/" },
  { label: "Instagram", href: "https://www.instagram.com/ashmitkhurana_/" },
];

export const nav: NavItem[] = [
  { label: "Work", href: "/work" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/#contact" },
];

export const hero = {
  scrollLabel: "Scroll to explore",
} as const;

export const unravel = {
  line: "Interfaces, systems and AI. One continuous line.",
} as const;

export const work = {
  heading: ["SELECTED WORK"] as const,
  viewAll: { label: "View all", href: "/work" },
  /** slugs shown on the home page, in order */
  featured: ["alpha-block", "sleepara", "arcadia-design"],
  /** ribbon depth + order stagger for the featured cards */
  featuredDepths: [0, -40, 20],
} as const;

export const build = {
  heading: ["HOW", "I BUILD"] as const,
  eyebrow: "Good work has a point of view.",
  intro:
    "Ideas to products. Systems to scale. I design, develop, and connect the dots across the full stack.",
  principles: [
    {
      number: "01",
      title: "Make it understandable",
      text: "The best details make a complex thing feel simple.",
    },
    {
      number: "02",
      title: "Make it feel right",
      text: "Speed, rhythm, and feedback are part of the product.",
    },
    {
      number: "03",
      title: "Make it hold up",
      text: "A polished interface should rest on dependable engineering.",
    },
  ] satisfies Principle[],
  experienceLabel: "Experience",
  experienceLink: { label: "Full story", href: "/about" },
} as const;

export const terminal = {
  caption: "SAME JOURNEY. DIFFERENT PERSPECTIVE.",
  prompt: "explore",
  commands: ["work", "about", "contact"] as const,
} as const;

export const contact = {
  heading: ["LET’S BUILD", "SOMETHING."] as const,
  eyebrow: "Have something in mind?",
  ctaHeading: ["LET\u2019S MAKE", "IT REAL."] as const,
  copy: "Open to full-time roles, freelance projects and ideas with room to play.",
  copyLabel: "Copy email",
  copiedLabel: "Copied to clipboard",
} as const;

export const about = {
  eyebrow: "Full-Stack Developer",
  heading: ["ABOUT"] as const,
  lede: "I care about how it works — and how it feels.",
  paragraphs: [
    "I build across the interface and the systems behind it, from the first interaction to the details that make a product dependable.",
    "I’m a full-stack developer with a B.Tech in Computer Science & Engineering (AI & Machine Learning). Alongside college I’ve shipped production products used by thousands of people, from a real-time crypto intelligence platform to high-conversion web apps.",
    "I’m drawn to two things most teams treat as afterthoughts: performance and real-time data. I’ve cut load times by 25%, shipped sub-second alerting, and helped clients lift conversion in ways you can measure.",
    "Right now I’m Front End Lead at Alpha Block. I like thoughtful engineering, clear communication, and ideas with room to play.",
  ],
} as const;

export const stats: Stat[] = [
  { value: "100+", label: "On-chain transactions per day" },
  { value: "1,000+", label: "Active users supported" },
  { value: "25%", label: "Load time reduction" },
  { value: "7%", label: "Conversion rate increase" },
];

export const experience: ExperienceEntry[] = [
  {
    company: "Alpha Block",
    role: "Front End Lead",
    period: "Oct 2025 — Present",
    type: "Remote",
    url: "https://app.alpha-block.ai/",
    highlights: [
      "Engineered a real-time crypto platform analyzing whale & KOL wallet activity across multichain ecosystems",
      "Processed 100+ on-chain transactions daily; sub-second Telegram alert delivery",
      "Integrated Phantom wallet for non-custodial Web3 auth",
      "Supported 1,000+ active users in production",
    ],
  },
  {
    company: "Bruxford Digital",
    role: "React-Next Intern",
    period: "Jul 2025 — Sept 2025",
    type: "Remote",
    url: "https://sleepara.com/",
    highlights: [
      "Built responsive web apps (React + Next.js) focused on performance and UX",
      "Reduced page load times by 25% through optimized rendering & asset handling",
      "Increased conversion rate by 7%",
    ],
  },
  {
    company: "Arcadia Designs Inc.",
    role: "Frontend Developer",
    period: "Aug 2024 — Sept 2024",
    type: "Remote",
    url: "https://www.arcadiadesignsinc.com/",
    highlights: [
      "Designed & developed a high-conversion portfolio for a Canadian architecture firm",
      "Implemented modern UI/UX with fluid animations",
      "Increased form submission rate by 12%",
    ],
  },
  {
    company: "MonkT",
    role: "Web Development Intern",
    period: "Dec 2023 — Jan 2024",
    type: "Remote",
    url: "https://monktechnology.net/",
    highlights: [
      "Designed & launched a fully responsive business website end-to-end",
      "Focused on UX optimization and cross-device compatibility",
    ],
  },
];

export const skills: SkillGroup[] = [
  {
    label: "Interfaces",
    skills: ["React", "Next.js", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS"],
  },
  {
    label: "Systems",
    skills: [
      "REST APIs",
      "Real-Time Systems",
      "Node.js",
      "MongoDB",
      "Firebase",
      "Performance Optimization",
      "Web3 Integration",
    ],
  },
  {
    label: "Tools & Platforms",
    skills: ["Git", "Figma", "Shopify", "Webflow", "Wix", "Framer", "Spline"],
  },
];

export const education = [
  {
    degree: "B.Tech, Computer Science & Engineering (AI & Machine Learning)",
    school: "Dronacharya Group of Institutions, Greater Noida",
    period: "Nov 2022 — Jul 2026",
  },
] as const;

export const footer = {
  legal: `© ${identity.year} ${identity.name}`,
} as const;

/** All projects, in display order. */
export const allProjects: Project[] = projects;

/** Featured projects for the home page, resolved from slugs. */
export const featuredProjects: Project[] = work.featured
  .map((slug) => projects.find((p) => p.slug === slug))
  .filter((p): p is Project => Boolean(p));
