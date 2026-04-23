# Portfolio Overhaul - Complete Reference Guide

> Last Updated: April 2026

---

## Personal Information

### Identity

| Field | Value |
|-------|-------|
| Full Name | Ashmit Khurana |
| Email | ashmit.khu@gmail.com |
| Location | India |
| Current Role | B.Tech undergraduate in Computer Science & Engineering |

### Professional Taglines (from Hero section)

- **Primary Role**: "Pixel Playmaker"
- **Secondary Role**: "Code Conjurer"

---

## Education

### Academic Background

**Bachelor of Technology (B.Tech) in Computer Science & Engineering**

- **Duration**: 2022 - 2026 (expected)
- **Status**: Undergraduate student

---

## Experience

### Work History (Chronological)

| Period | Organization | Role | Type | Description |
|--------|-------------|------|------|------|------------|
| Jan 2023 - Mar 2023 | Google Developer Student Clubs | Technical Coordinator | Volunteer | Leading technical initiatives and coordinating developer activities |
| May 2023 - Oct 2023 | ProjectDegree | Content Creation Intern | Internship | Created and edited video content for social media platforms, focusing on educational content and student engagement |
| Jan 2023 - Dec 2023 | MonkT | Flutter Developer | Internship | Developed cross-platform mobile applications using Flutter, focusing on creating responsive and user-friendly interfaces |
| Dec 2023 - Jan 2024 | MonkT | Web Developer | Internship | Developed & deployed monktechnology.net using WIX Website Builder |

---

## Technical Skills

### Core Skills

#### Mobile Development
| Skill | Proficiency | Notes |
|-------|-------------|-------|
| Flutter | Expert | Cross-platform app development, state management with Provider/Bloc |
| Swift | Expert | Native iOS development |
| SwiftUI | Advanced | Modern declarative UI for iOS |
| Kotlin | Intermediate | Native Android development |

#### Web Development
| Skill | Proficiency | Notes |
|-------|-------------|-------|
| React | Expert | Modern React with Hooks and Functional Components |
| TypeScript | Expert | Full TypeScript integration |
| JavaScript | Expert | ES6+ features |
| Tailwind CSS | Expert | Utility-first CSS framework |

#### Backend & Databases
| Skill | Proficiency | Notes |
|-------|-------------|-------|
| Firebase | Expert | Authentication, Firestore, Cloud Functions, Storage |
| RESTful APIs | Advanced | API integration |

#### Tools & Platforms
| Skill | Proficiency | Notes |
|-------|-------------|-------|
| Git | Expert | Version control, GitHub |
| Figma | Advanced | UI/UX design and prototyping |
| Webflow | Advanced | No-code web development |
| Wix | Advanced | Website building |
| Shopify | Intermediate | E-commerce solutions |
| Framer | Intermediate | Interactive prototypes |
| Spline | Basic | 3D design for web |

---

## Projects

### Portfolio Case Studies (8 Total)

| # | Slug | Title | Client | Tech Stack |
|---|------|-------|-------|------------|
| 1 | nerdwithabindi | NerdWithABindi | NerdWithABindi LLC | React, Next.js, Google Forms, HTML, CSS, Tailwind |
| 2 | sleepara | Sleepara | Sleepara Inc. | Shopify, Stripe, React, Next.js, Custom AI |
| 3 | arcadia-design | Arcadia Design | Arcadia Design Inc. | HTML, CSS, JS, Tailwind, TypeScript, Alpine.js |
| 4 | bellarisse | Bellarisse | Bellarisse Luxury Goods | Framer, Shopify, Liquid, JS, CSS |
| 5 | eventsync | EventSync | TechSprint48 | React, MongoDB, Express, Node.js |
| 6 | monk-technology | Monk Technology | Monk Technology | WIX, Velo, JavaScript, 3D |
| 7 | portfolio-website | Portfolio Website | Personal | React, Tailwind, TypeScript, Framer Motion, Vite |
| 8 | chat-app | Chat App | Personal (Open Source) | Flutter, Firebase, Dart |

---

## Social Links

### Primary Links

| Platform | URL | Icon Source |
|----------|-----|-----------|
| GitHub | https://github.com/ashmitkhurana | GitHub icon |
| LinkedIn | https://linkedin.com/in/ashmitkhurana | LinkedIn icon |
| Instagram | https://www.instagram.com/ashmitkhurana_/ | Instagram icon |
| Email | ashmit.khu@gmail.com | — |

---

## Terminal Component Reference

**KEEP AS-IS** - The Terminal component is a key gimmick feature and must be preserved in the overhaul.

### Terminal Specifications

- **Title**: "Terminal"
- **Prompt**: `ashmit@portfolio:~$`
- **Container**: macOS-style window with traffic light buttons (red, yellow, green)
- **Theme**: Dark background (`#0a0a0a`)
- **Font**: Monospace

### Supported Commands

```
=== NAVIGATION ===
help         Show this help menu
clear        Clear the terminal
about        Learn about me
contact      How to reach me

=== LISTING ===
ls           List my skills and projects
ls Skills/   List all my skills in detail
ls Projects/ List my projects

=== VIEWING ===
cat resume.txt     View my resume
cat skills.txt     View detailed skills
cat flutter.md     View Flutter skills
cat react.md       View React skills 
cat swift.md       View iOS/Swift skills
cat project1.md    View mobile app details
cat project2.md    View web app details
cat project3.md    View portfolio details

=== ACTIONS ===
download resume    Download my resume (PDF)

=== FUN ===
sudo ask-me-anything  Get a random fun fact
hack                  Matrix rain effect
nuke                  💥 DESTRUCTIVE - destroys site until reload
```

### Terminal Responses (Quick Reference)

| Command | Response Type | Content |
|---------|---------------|---------|
| `about` | text | "I'm a B.Tech undergrad student in Computer Science and Engineering, passionate about creating innovative mobile and web solutions. I specialize in Flutter, iOS, and front-end web development." |
| `contact` | text | Email, GitHub, LinkedIn links |
| `download resume` | action | Triggers PDF download from `/resume.pdf` |
| `hack` | warning + animation | Matrix rain effect (3-5 seconds) |
| `nuke` | warning | Prompts confirmation |
| `nuke confirm` | error + animation | Nuclear destruction effect |

### Terminal Easter Eggs

1. **Matrix Effect**: `hack` command triggers falling green characters like The Matrix
2. **Nuclear Option**: `nuke confirm` destroys the website with shockwave + flash + aftermath

---

## Current Website Structure

### Sections (Home Page)

| Order | Section | ID | Component |
|-------|---------|-----|----------|
| 1 | Home | `#home` | Hero |
| 2 | — | — | About |
| 3 | Projects | `#projects` | Projects |
| 4 | Skills | `#skills` | Skills |
| 5 | Experience | `#experience` | Experience |
| 6 | Education | `#education` | Education |
| 7 | Terminal | `#terminal` | Terminal |
| 8 | Contact | `#contact` | Contact |

### Routing

| Path | Page | Component |
|------|------|----------|
| `/` | HomePage | HomePage component |
| `/projects/:slug` | CaseStudyPage | CaseStudyPage |

### URL Parameters

| Parameter | Effect |
|-----------|--------|
| `?safe=1` | Safe mode - renders minimal content for diagnostics |
| `?debug=1` | Enables ErrorBoundary in production |

---

## Visual Design (Current)

### Color Palette

| Usage | Color | Hex |
|-------|-------|-----|
| Background | Black | `#0a0a0a` |
| Primary Gradient | Blue → Purple → Pink | `#3b82f6` → `#a855f7` → `#ec4899` |
| Text Primary | White | `#ffffff` |
| Text Secondary | Gray | `#6b7280` (gray-500), `#9ca3af` (gray-400) |
| Accent | Blue | `#3b82f6` |
| Glass Effect | Semi-transparent | — |

### Animations

- **Hero Title**: Animated gradient background (8s cycle, 300% size)
- **Hero Subtitle**: Animated gradient (5s cycle, 200% size)
- **Scroll Effects**: `framer-motion` for reveal animations
- **Background**: Animated Squares component (diagonal movement)

---

## Tech Stack (To Preserve/Upgrade)

### Current Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^7.8.0",
    "framer-motion": "^11.18.2",
    "gsap": "^3.13.0",
    "aos": "^2.3.4",
    "react-parallax": "^3.5.1",
    "react-scroll-parallax": "^3.4.5",
    "chart.js": "^4.5.0",
    "react-chartjs-2": "^5.3.0",
    "lucide-react": "^0.344.0",
    "tailwind-merge": "^3.3.1",
    "clsx": "^2.1.1",
    "react-intersection-observer": "^9.8.1"
  },
  "devDependencies": {
    "vite": "^5.1.3",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "@vitejs/plugin-react": "^4.2.1"
  }
}
```

---

## Build & Deployment

### Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview # Preview production build
npm run lint    # Run ESLint
```

### Deployment

- **Platform**: Vercel
- **Config**: `vercel.json` present

---

## Known TODOs (from README)

> TODO: Remove MockDataBanner component after case studies are complete

- Component: `src/components/MockDataBanner.tsx`
- Location: `src/pages/CaseStudyPage.tsx`
- Behavior: Dismissible per tab using `sessionStorage`

---

## Icons Reference

Using **Lucide React** for all icons:

- `Github` - GitHub link
- `Linkedin` - LinkedIn link
- `Instagram` - Instagram link
- `Briefcase` - Work experience
- `Users` - Volunteer work
- `Code2` - JavaScript/TypeScript
- `Smartphone` - Mobile development
- `Globe` - Web development
- `Database` - Firebase/Backend
- `GitBranch` - Git
- `Layout` - Webflow
- `Palette` - Figma
- `Store` - Wix/Shopify
- `Sparkles` - Framer
- `Boxes` - Spline

---

## Fun Facts (for Terminal)

1. Wrote first line of code at age 12
2. Favorite programming language: TypeScript
3. Can solve a Rubik's cube in under 2 minutes
4. Dream project: Comprehensive health-tracking application

---

## Resume PDF

- **Location**: `/public/resume.pdf`
- **Backup**: Desktop `AshmitKhuranaResume.pdf`
- **Download Command**: `download resume` in terminal

---

## Notes for Overhaul

### Keep These Elements

- ✅ Terminal component (macOS style, full commands, easter eggs)
- ✅ Dark theme (`#0a0a0a`)
- ✅ Gradient animations on hero text
- ✅ Animated Squares background
- ✅ Framer Motion scroll animations
- ✅ All 8 case studies
- ✅ ErrorBoundary for dev/debug

### Potential Improvements

- [ ] Update case study data with new projects
- [ ] Add more social links (Twitter, Threads, etc.)
- [ ] Improve mobile responsiveness
- [ ] Add more interactive elements
- [ ] Update resume with latest experience
- [ ] Consider adding blog section
- [ ] Add accessibility improvements
- [ ] Lighthouse score target: 100

---

## Contact Information

| Channel | Handle/URL |
|---------|------------|
| Email | ashmit.khu@gmail.com |
| GitHub | github.com/ashmitkhurana |
| LinkedIn | linkedin.com/in/ashmitkhurana |
| Instagram | @ashmitkhurana_ |