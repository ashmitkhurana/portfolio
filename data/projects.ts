export type Project = {
  slug: string;
  /** full original title, e.g. "Alpha Block — Crypto Intelligence Platform" */
  title: string;
  /** short display name, e.g. "Alpha Block" */
  name: string;
  /** what it is, e.g. "Crypto intelligence platform" */
  kind: string;
  /** one-line card descriptor, e.g. "Crypto intelligence · Real-time data" */
  descriptor: string;
  /** one-sentence card summary */
  summary: string;
  /** full-length description shown under the case-study title */
  tagline: string;
  problem: string;
  solution: string;
  impact: string[];
  stack: string[];
  cover?: string;
  liveUrl?: string;
  githubUrl?: string;
};

export const projects: Project[] = [
  {
    slug: "alpha-block",
    title: "Alpha Block — Crypto Intelligence Platform",
    name: "Alpha Block",
    kind: "Crypto intelligence platform",
    descriptor: "Crypto intelligence · Real-time data",
    summary: "A multichain analytics platform for whale and KOL wallet activity.",
    tagline: "Real-time multichain analytics platform for whale & KOL wallet activity",
    problem:
      "Traders lacked real-time visibility into whale and KOL wallet activity across multiple blockchains, missing critical trade signals.",
    solution:
      "Built a production-grade crypto intelligence platform processing 100+ on-chain transactions daily, delivering sub-second Telegram alerts, and supporting 1,000+ users with live blockchain dashboards and Phantom wallet auth.",
    impact: [
      "100+ on-chain transactions processed daily",
      "1,000+ active users in production",
      "Sub-second Telegram alert delivery",
      "Phantom Web3 wallet authentication",
    ],
    stack: ["React", "Next.js", "TypeScript", "Web3", "Phantom", "Real-Time APIs"],
    cover: "/images/alphablock.png",
    liveUrl: "https://app.alpha-block.ai/",
  },
  {
    slug: "sleepara",
    title: "Sleepara — Sleep Health Platform",
    name: "Sleepara",
    kind: "Sleep health platform",
    descriptor: "Sleep health · Digital product",
    summary: "A sleep health platform connecting people with sleep apnea specialists.",
    tagline:
      "A comprehensive sleep health platform that connects users with sleep apnea specialists, provides AI-powered sleep advice, and locates nearby pharmacies for CPAP supplies. Designed to make sleep healthcare more accessible and personalized.",
    problem:
      "Users needed a scalable, fast platform for booking sleep specialist sessions with high conversion.",
    solution:
      "Built responsive Next.js web app with optimized rendering, REST API integration, and performance-first architecture.",
    impact: [
      "25% reduction in page load time",
      "7% increase in conversion rate",
      "Fully responsive across all devices",
    ],
    stack: ["Shopify", "Stripe", "Link", "React", "Next.js", "Custom AI"],
    cover: "/images/sleepara.png",
    liveUrl: "https://sleepara.com/",
  },
  {
    slug: "arcadia-design",
    title: "Arcadia Design — Architecture Portfolio",
    name: "Arcadia Design",
    kind: "Architecture portfolio",
    descriptor: "Architecture · Portfolio",
    summary: "A considered digital home for a Canadian architecture studio.",
    tagline:
      "A modern and visually striking portfolio website for Arcadia Design, a Canadian architecture firm. The site highlights their innovative projects, design philosophy, and expertise, offering an immersive experience for potential clients and collaborators.",
    problem:
      "Client needed a modern, conversion-focused website that reflected their premium architecture brand.",
    solution:
      "Designed and developed a responsive, animation-rich portfolio with a focus on UX and lead generation.",
    impact: [
      "12% increase in form submission rate",
      "Fluid animations and modern UI/UX",
      "Fully responsive across mobile and desktop",
    ],
    stack: ["HTML", "CSS", "JavaScript", "Tailwind CSS", "TypeScript"],
    cover: "/images/arcadia.png",
    liveUrl: "https://www.arcadiadesignsinc.com/",
  },
  {
    slug: "nerdwithabindi",
    title: "NerdWithABindi — Influencer Collaboration",
    name: "NerdWithABindi",
    kind: "Influencer collaboration",
    descriptor: "Creator platform · Collaboration",
    summary: "A shared workspace for influencers to connect and coordinate campaigns.",
    tagline:
      "A collaboration platform for influencers to connect, share resources, and coordinate campaigns. Streamlines partnership opportunities and content creation through an intuitive interface.",
    problem:
      "Influencers needed a centralized platform to connect and manage collaborative projects seamlessly.",
    solution:
      "Developed a responsive Next.js application integrated with Google Forms to streamline influencer coordination.",
    impact: [
      "Improved collaboration efficiency",
      "Streamlined data collection",
      "Responsive, accessible design",
    ],
    stack: ["React", "Next.js", "Google Form", "HTML", "CSS"],
    cover: "/images/nerdwithabindi.png",
  },
  {
    slug: "eventsync",
    title: "EventSync (TechSprint) — Event Management",
    name: "EventSync",
    kind: "Event management",
    descriptor: "Event management · Full-stack",
    summary: "Event creation, RSVPs and analytics in one place, built for TechSprint48.",
    tagline:
      "A one-stop solution for seamless event creation and management, EventSync empowers users to organize events effortlessly, manage RSVPs, and gain actionable analytics for better engagement and planning.",
    problem:
      "Event organizers lacked a unified solution for creating, managing, and synchronizing large-scale events.",
    solution:
      "Architected a full-stack application using the MERN stack to handle complex event data, user registrations, and real-time syncing.",
    impact: [
      "Centralized event management dashboard",
      "Scalable database architecture",
      "Real-time event synchronization",
    ],
    stack: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "MongoDB", "Mongoose"],
    cover: "/images/eventsync.png",
    githubUrl: "https://github.com/ashmitkhurana/EventSync",
  },
  {
    slug: "monk-technology",
    title: "Monktechnology.net — Business Website",
    name: "Monk Technology",
    kind: "Business website",
    descriptor: "Business website · 3D",
    summary: "A business website for creators, with a dynamic 3D interface.",
    tagline:
      "A modern business website showcasing development and design excellence for creators, featuring a dynamic 3D interface and seamless user experience.",
    problem:
      "MonkT needed a professional web presence with cross-device compatibility.",
    solution:
      "Designed and launched a fully responsive business website with UX optimization and user testing.",
    impact: [
      "Cross-device compatible",
      "UX-optimized with real user testing",
      "Interactive 3D model integration",
    ],
    stack: ["WIX", "Web Development", "UI/UX", "3D Design"],
    cover: "/images/monk-tech.png",
    liveUrl: "https://monktechnology.net/",
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}
