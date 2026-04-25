export type Project = {
  slug: string;
  title: string;
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
    liveUrl: "https://app.alpha-block.ai/",
  },
  {
    slug: "sleepara",
    title: "Sleepara — Sleep Health Platform",
    tagline: "A comprehensive sleep health platform that connects users with sleep apnea specialists,...",
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
    liveUrl: "https://sleepara.com/",
  },
  {
    slug: "arcadia-design",
    title: "Arcadia Design — Architecture Portfolio",
    tagline: "A modern and visually striking portfolio website for Arcadia Design, a Canadian architectur...",
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
    liveUrl: "https://www.arcadiadesignsinc.com/",
  },
  {
    slug: "bellarisse",
    title: "Bellarisse — Luxury E-commerce",
    tagline: "A beautifully crafted e-commerce platform for Bellarisse, an Indian luxury...",
    problem:
      "A luxury brand required a premium online storefront that reflects their high-end aesthetic while maintaining robust e-commerce capabilities.",
    solution:
      "Leveraged Shopify for robust e-commerce features paired with Framer for an ultra-premium, interactive frontend experience.",
    impact: [
      "High-converting premium storefront",
      "Seamless checkout experience",
      "Interactive 3D and scroll animations",
    ],
    stack: ["Framer", "Shopify"],
  },
  {
    slug: "nerdwithabindi",
    title: "NerdWithABindi — Influencer Collaboration",
    tagline: "A collaboration platform for influencers to connect, share resources, and coordinate...",
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
  },
  {
    slug: "eventsync",
    title: "EventSync (TechSprint) — Event Management",
    tagline: "A one-stop solution for seamless event creation and management, EventSync...",
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
  },
  {
    slug: "monk-technology",
    title: "Monktechnology.net — Business Website",
    tagline: "A modern business website showcasing development and design excellence for creators,...",
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
    liveUrl: "https://monktechnology.net/",
  },
];