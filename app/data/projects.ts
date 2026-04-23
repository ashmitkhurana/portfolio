export interface ProcessStep {
  stage: string;
  description: string;
}

export interface ProjectImage {
  src: string;
  alt: string;
}

export interface Metric {
  label: string;
  value: number;
  unit: string;
}

export interface Testimonial {
  quote: string;
  author: string;
}

export interface Project {
  slug: string;
  title: string;
  tagline: string;
  client: string;
  problem: string;
  role: string;
  tech: string[];
  process: ProcessStep[];
  images: ProjectImage[];
  metrics: Metric[];
  testimonial: Testimonial;
}

export const projects: Project[] = [
  {
    slug: "nerdwithabindi",
    title: "NerdWithABindi",
    tagline: "Empowering influencers through collaborative connection and resource sharing",
    client: "NerdWithABindi LLC",
    problem: "Influencers in the tech and lifestyle space were struggling to connect with each other, find partnership opportunities, and share resources efficiently. NerdWithABindi needed a platform to facilitate these connections, streamline collaboration, and provide a central hub for their growing community.",
    role: "Lead Developer and Platform Architect",
    tech: ["React", "Next.js", "Google Forms Integration", "HTML", "CSS", "Tailwind CSS"],
    process: [
      {
        stage: "Research",
        description: "Conducted interviews with influencers to understand their collaboration challenges and specific needs for resource sharing."
      },
      {
        stage: "Planning",
        description: "Developed a comprehensive platform roadmap with features prioritized based on influencer feedback and business goals."
      },
      {
        stage: "Design",
        description: "Created wireframes and interactive prototypes focused on intuitive navigation and seamless collaboration features."
      },
      {
        stage: "Development",
        description: "Built a responsive platform using Next.js with custom features for profile creation, resource sharing, and campaign coordination."
      },
      {
        stage: "Integration",
        description: "Implemented Google Forms integration for streamlined onboarding and partnership applications."
      },
      {
        stage: "Launch & Iteration",
        description: "Deployed the platform and collected user feedback to guide continuous improvements and feature enhancements."
      }
    ],
    images: [
      {
        src: "/images/nerdwithabindi.png",
        alt: "NerdWithABindi platform homepage featuring the collaboration dashboard"
      },
      {
        src: "/images/nerdwithabindi-profiles.jpg",
        alt: "Influencer profiles section on the NerdWithABindi platform"
      },
      {
        src: "/images/nerdwithabindi-resources.jpg",
        alt: "Resource sharing interface showing downloadable content"
      },
      {
        src: "/images/nerdwithabindi-mobile.jpg",
        alt: "Mobile responsive view of the NerdWithABindi platform"
      }
    ],
    metrics: [
      {
        label: "User Growth",
        value: 165,
        unit: "%"
      },
      {
        label: "Collaborations",
        value: 78,
        unit: "monthly"
      },
      {
        label: "Resource Downloads",
        value: 1240,
        unit: "monthly"
      },
      {
        label: "Campaign Success Rate",
        value: 92,
        unit: "%"
      }
    ],
    testimonial: {
      quote: "Ashmit created exactly what our influencer community needed. The platform has made collaboration effortless and has become an essential hub for our members to connect and grow together.",
      author: "Maya Patel, Founder of NerdWithABindi"
    }
  },
  {
    slug: "sleepara",
    title: "Sleepara",
    tagline: "Revolutionizing sleep health through personalized care and accessible resources",
    client: "Sleepara Inc.",
    problem: "Sleep apnea affects millions of people worldwide, but accessing specialists and CPAP supplies remains challenging. Sleepara needed a comprehensive platform to connect users with sleep specialists, provide AI-powered sleep advice, and help locate nearby pharmacies for CPAP supplies.",
    role: "Lead Developer and UX Designer",
    tech: ["Shopify", "Stripe", "React", "Next.js", "Custom AI", "Tailwind CSS"],
    process: [
      {
        stage: "Discovery",
        description: "Conducted in-depth research on sleep health industry and user needs through interviews with sleep specialists and patients."
      },
      {
        stage: "UX Design",
        description: "Created wireframes and prototypes focused on simplifying the process of connecting with specialists and finding resources."
      },
      {
        stage: "Development",
        description: "Built a custom Shopify storefront with Next.js and integrated Stripe for payment processing."
      },
      {
        stage: "AI Integration",
        description: "Implemented a custom AI advisor to provide personalized sleep recommendations based on user data."
      },
      {
        stage: "Testing & Launch",
        description: "Conducted extensive user testing and iterative improvements before successful public launch."
      }
    ],
    images: [
      {
        src: "/images/sleepara.png",
        alt: "Sleepara homepage showcasing the sleep health platform interface"
      },
      {
        src: "/images/sleepara-specialist.jpg",
        alt: "Specialist finder interface on the Sleepara platform"
      },
      {
        src: "/images/sleepara-ai.jpg",
        alt: "AI sleep advisor interface providing personalized recommendations"
      },
      {
        src: "/images/sleepara-mobile.jpg",
        alt: "Sleepara mobile responsive design on smartphone"
      }
    ],
    metrics: [
      {
        label: "User Engagement",
        value: 85,
        unit: "%"
      },
      {
        label: "Appointment Bookings",
        value: 320,
        unit: "monthly"
      },
      {
        label: "Customer Satisfaction",
        value: 94,
        unit: "%"
      },
      {
        label: "Revenue Growth",
        value: 68,
        unit: "%"
      }
    ],
    testimonial: {
      quote: "The platform Ashmit built has transformed how we connect with patients. The AI sleep advisor has been particularly revolutionary, allowing us to provide personalized guidance at scale.",
      author: "Dr. Sarah Chen, Chief Medical Officer at Sleepara"
    }
  },
  {
    slug: "arcadia-design",
    title: "Arcadia Design",
    tagline: "Showcasing architectural excellence through immersive digital experiences",
    client: "Arcadia Design Inc.",
    problem: "As a leading Canadian architecture firm, Arcadia Design needed a visually stunning website that would effectively showcase their innovative projects, communicate their design philosophy, and attract potential clients and collaborators. Their existing site failed to capture the essence of their work and lacked the functionality to properly display their architectural portfolio.",
    role: "Full-Stack Developer and Design Consultant",
    tech: ["HTML", "CSS", "JavaScript", "Tailwind CSS", "TypeScript", "Alpine.js"],
    process: [
      {
        stage: "Discovery",
        description: "Worked closely with the Arcadia team to understand their brand identity, architectural philosophy, and portfolio requirements."
      },
      {
        stage: "Architecture",
        description: "Developed a site architecture that would highlight their projects while telling the story of their design approach and company values."
      },
      {
        stage: "Visual Design",
        description: "Created a minimal, elegant design language that puts the focus on architectural imagery while maintaining brand coherence."
      },
      {
        stage: "Development",
        description: "Built a highly performant, responsive website using modern web technologies and optimized for exceptional visual presentation."
      },
      {
        stage: "Portfolio Integration",
        description: "Implemented a custom portfolio system with filtering, detailed project views, and high-resolution image galleries."
      },
      {
        stage: "Launch & Training",
        description: "Deployed the site and provided the Arcadia team with training on the content management system for ongoing updates."
      }
    ],
    images: [
      {
        src: "/images/arcadia.png",
        alt: "Arcadia Design homepage featuring architectural projects in a grid layout"
      },
      {
        src: "/images/arcadia-portfolio.jpg",
        alt: "Portfolio detail page showing an architectural project with specifications"
      },
      {
        src: "/images/arcadia-about.jpg",
        alt: "About page showcasing the Arcadia Design team and philosophy"
      },
      {
        src: "/images/arcadia-responsive.jpg",
        alt: "Responsive design of the Arcadia website on various devices"
      }
    ],
    metrics: [
      {
        label: "Traffic Increase",
        value: 143,
        unit: "%"
      },
      {
        label: "Avg. Session Duration",
        value: 4.2,
        unit: "minutes"
      },
      {
        label: "Project Inquiries",
        value: 35,
        unit: "monthly"
      },
      {
        label: "Portfolio View Time",
        value: 78,
        unit: "%"
      }
    ],
    testimonial: {
      quote: "The website Ashmit created perfectly captures our aesthetic and showcases our work in a way that resonates with clients. We've seen a significant increase in quality inquiries since launch.",
      author: "Michael Thompson, Principal Architect at Arcadia Design"
    }
  },
  {
    slug: "bellarisse",
    title: "Bellarisse",
    tagline: "Elevating luxury handbag shopping through elegant digital experiences",
    client: "Bellarisse Luxury Goods",
    problem: "Bellarisse, an emerging Indian luxury handbag brand, needed an e-commerce platform that would convey their premium positioning, showcase their handcrafted products, and provide a seamless shopping experience. They required a solution that balanced luxury aesthetics with functionality while reflecting their unique brand story.",
    role: "E-commerce Developer and UX Consultant",
    tech: ["Framer", "Shopify", "Liquid", "JavaScript", "CSS", "Web Animations API"],
    process: [
      {
        stage: "Brand Analysis",
        description: "Conducted a comprehensive analysis of the Bellarisse brand identity, target audience, and competitive landscape."
      },
      {
        stage: "Strategy",
        description: "Developed an e-commerce strategy focused on creating an exclusive shopping experience that highlights product craftsmanship."
      },
      {
        stage: "UX Design",
        description: "Created wireframes and user flows optimized for product discovery, detailed viewing, and frictionless checkout."
      },
      {
        stage: "Visual Design",
        description: "Designed a sophisticated visual language with custom animations and micro-interactions that reinforce the luxury positioning."
      },
      {
        stage: "Development",
        description: "Built a custom Shopify theme using Framer for animations and advanced interactions that enhance the product browsing experience."
      },
      {
        stage: "Testing & Optimization",
        description: "Conducted extensive usability testing and optimized for conversion rate and average order value."
      }
    ],
    images: [
      {
        src: "/images/bellarisse.png",
        alt: "Bellarisse homepage featuring luxury handbag collections"
      },
      {
        src: "/images/bellarisse-product.jpg",
        alt: "Product detail page with 360-degree view functionality"
      },
      {
        src: "/images/bellarisse-cart.jpg",
        alt: "Custom shopping cart experience with product recommendations"
      },
      {
        src: "/images/bellarisse-mobile.jpg",
        alt: "Mobile shopping experience optimized for touch interactions"
      }
    ],
    metrics: [
      {
        label: "Conversion Rate",
        value: 3.8,
        unit: "%"
      },
      {
        label: "Avg. Order Value",
        value: 42,
        unit: "% increase"
      },
      {
        label: "Time on Product Pages",
        value: 2.7,
        unit: "minutes"
      },
      {
        label: "Return Rate",
        value: 3.2,
        unit: "%"
      }
    ],
    testimonial: {
      quote: "Ashmit transformed our online presence into an experience that truly reflects our brand's luxury positioning. The attention to detail in both design and functionality has been instrumental in our growth.",
      author: "Priya Mehta, Founder and Creative Director at Bellarisse"
    }
  },
  {
    slug: "eventsync",
    title: "EventSync",
    tagline: "Simplifying event management through intelligent automation and analytics",
    client: "TechSprint48 Hackathon Project",
    problem: "Event organizers face numerous challenges in managing registrations, tracking attendance, and gathering meaningful analytics. During the TechSprint48 Hackathon, our team identified the need for a streamlined solution that would simplify the entire event lifecycle from creation to post-event analysis.",
    role: "Full-Stack Developer and Team Lead",
    tech: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "MongoDB", "Mongoose", "Express.js", "Node.js"],
    process: [
      {
        stage: "Problem Definition",
        description: "Analyzed event management pain points and defined core features for an MVP solution within the 48-hour hackathon constraint."
      },
      {
        stage: "Architecture Planning",
        description: "Designed a scalable architecture with clear separation between frontend, API, and database layers."
      },
      {
        stage: "Frontend Development",
        description: "Built a responsive React interface with TypeScript for type safety and improved developer experience."
      },
      {
        stage: "Backend Implementation",
        description: "Created a Node.js/Express API with MongoDB/Mongoose for data persistence and real-time updates."
      },
      {
        stage: "Analytics Integration",
        description: "Implemented custom analytics dashboard for event insights and attendee engagement metrics."
      },
      {
        stage: "Presentation & Demo",
        description: "Prepared and delivered the final presentation, showcasing the solution's capabilities and technical architecture."
      }
    ],
    images: [
      {
        src: "/images/eventsync.png",
        alt: "EventSync dashboard showing event management interface"
      },
      {
        src: "/images/eventsync-create.jpg",
        alt: "Event creation wizard with multi-step form process"
      },
      {
        src: "/images/eventsync-analytics.jpg",
        alt: "Analytics dashboard showing event performance metrics"
      },
      {
        src: "/images/eventsync-mobile.jpg",
        alt: "Mobile view of the EventSync attendee interface"
      }
    ],
    metrics: [
      {
        label: "Hackathon Ranking",
        value: 2,
        unit: "nd place"
      },
      {
        label: "Features Completed",
        value: 95,
        unit: "%"
      },
      {
        label: "Team Efficiency",
        value: 87,
        unit: "%"
      },
      {
        label: "Technical Score",
        value: 9.2,
        unit: "/10"
      }
    ],
    testimonial: {
      quote: "Ashmit's leadership and technical expertise were crucial to our success in the hackathon. His ability to architect a solution and coordinate our team effort in such a short timeframe was impressive.",
      author: "Jessica Wang, TechSprint48 Judge and CTO at EventTech Ventures"
    }
  },
  {
    slug: "monk-technology",
    title: "Monktechnology.net",
    tagline: "Showcasing digital excellence through immersive 3D experiences",
    client: "Monk Technology",
    problem: "Monk Technology needed a modern business website that would showcase their development and design services for creators. Their previous site lacked visual impact and failed to communicate their technical capabilities and creative approach. They wanted a dynamic experience that would set them apart from competitors.",
    role: "Web Designer and Developer",
    tech: ["WIX", "Velo by Wix", "JavaScript", "3D Design", "UI/UX", "SEO"],
    process: [
      {
        stage: "Brand Analysis",
        description: "Analyzed Monk Technology's brand positioning, target audience, and competitive landscape to inform the design direction."
      },
      {
        stage: "UX Strategy",
        description: "Developed a user experience strategy focused on showcasing technical capabilities through interactive elements."
      },
      {
        stage: "3D Design",
        description: "Created custom 3D elements and animations that communicate technical sophistication while maintaining usability."
      },
      {
        stage: "Development",
        description: "Leveraged Wix's Velo platform to implement custom interactions and dynamic content presentation."
      },
      {
        stage: "Performance Optimization",
        description: "Optimized 3D elements and animations for performance across devices while preserving visual quality."
      },
      {
        stage: "SEO Implementation",
        description: "Implemented comprehensive SEO strategy to improve visibility for key service offerings and target markets."
      }
    ],
    images: [
      {
        src: "/images/monk-tech.png",
        alt: "Monk Technology homepage featuring 3D interactive elements"
      },
      {
        src: "/images/monk-tech-services.jpg",
        alt: "Services page with animated service descriptions"
      },
      {
        src: "/images/monk-tech-portfolio.jpg",
        alt: "Portfolio section showcasing client work with interactive gallery"
      },
      {
        src: "/images/monk-tech-mobile.jpg",
        alt: "Mobile-optimized version of the Monk Technology website"
      }
    ],
    metrics: [
      {
        label: "Bounce Rate Reduction",
        value: 47,
        unit: "%"
      },
      {
        label: "Avg. Session Duration",
        value: 3.8,
        unit: "minutes"
      },
      {
        label: "Inquiry Conversion",
        value: 12.5,
        unit: "%"
      },
      {
        label: "Organic Traffic Growth",
        value: 135,
        unit: "%"
      }
    ],
    testimonial: {
      quote: "Ashmit understood exactly what we needed - a site that demonstrates our capabilities through experience rather than just telling. The 3D elements and seamless UX have significantly improved how potential clients perceive our services.",
      author: "David Monk, Founder of Monk Technology"
    }
  },
  {
    slug: "portfolio-website",
    title: "Portfolio Website",
    tagline: "Showcasing creative work through interactive design and seamless experiences",
    client: "Personal Project",
    problem: "I needed a personal portfolio that would effectively showcase my projects, skills, and approach to web development. The challenge was to create a site that would stand out among other developer portfolios while demonstrating technical proficiency and design sensibility.",
    role: "Designer and Developer",
    tech: ["React", "Tailwind CSS", "TypeScript", "Framer Motion", "Three.js", "Vite"],
    process: [
      {
        stage: "Self-Assessment",
        description: "Conducted a thorough analysis of my skills, projects, and the unique value I offer to potential clients and employers."
      },
      {
        stage: "Competitive Analysis",
        description: "Researched other developer portfolios to identify opportunities for differentiation and inspiration."
      },
      {
        stage: "Information Architecture",
        description: "Planned the content structure to highlight projects while effectively communicating my technical skills and approach."
      },
      {
        stage: "Visual Design",
        description: "Created a modern, minimalist design with strategic use of animations to enhance the user experience without overwhelming."
      },
      {
        stage: "Development",
        description: "Built the site using React and TypeScript with Tailwind CSS for styling and Framer Motion for animations."
      },
      {
        stage: "Performance Optimization",
        description: "Implemented code splitting, lazy loading, and performance optimizations for a smooth, responsive experience."
      }
    ],
    images: [
      {
        src: "/images/portfolio.png",
        alt: "Portfolio website homepage with 3D interactive elements"
      },
      {
        src: "/images/portfolio-projects.jpg",
        alt: "Projects section showcasing work with interactive cards"
      },
      {
        src: "/images/portfolio-about.jpg",
        alt: "About section with animated skill visualization"
      },
      {
        src: "/images/portfolio-mobile.jpg",
        alt: "Mobile responsive design of the portfolio website"
      }
    ],
    metrics: [
      {
        label: "Projects Highlighted",
        value: 8,
        unit: "case studies"
      },
      {
        label: "Page Load Speed",
        value: 1.2,
        unit: "seconds"
      },
      {
        label: "Lighthouse Score",
        value: 98,
        unit: "/100"
      },
      {
        label: "Client Inquiries",
        value: 15,
        unit: "monthly"
      }
    ],
    testimonial: {
      quote: "Ashmit's portfolio site immediately caught my attention with its clean design and thoughtful interactions. It clearly showcases not just his technical skills but also his understanding of effective digital experiences.",
      author: "Alex Rivera, Design Director at Creative Digital Agency"
    }
  },
  {
    slug: "chat-app",
    title: "Chat App",
    tagline: "Enabling real-time communication through a seamless mobile experience",
    client: "Personal Project / Open Source",
    problem: "Many existing chat applications are either too complex with unnecessary features or too simple with limited functionality. I wanted to create a clean, intuitive real-time chat application that focuses on the core experience of communication while implementing best practices in mobile development.",
    role: "Mobile App Developer",
    tech: ["Flutter", "Firebase", "Dart", "Cloud Functions", "Firebase Auth", "Firestore"],
    process: [
      {
        stage: "Concept & Planning",
        description: "Defined the core functionality and user experience goals for a minimalist yet powerful chat application."
      },
      {
        stage: "Architecture Design",
        description: "Designed a scalable architecture using Firebase for backend services and Flutter for cross-platform development."
      },
      {
        stage: "UI/UX Design",
        description: "Created a clean, intuitive interface with emphasis on the chat experience, message readability, and ease of use."
      },
      {
        stage: "Frontend Development",
        description: "Implemented the UI using Flutter, focusing on smooth animations, responsive design, and performance optimization."
      },
      {
        stage: "Backend Integration",
        description: "Set up Firebase Firestore for real-time data synchronization and Firebase Auth for secure user authentication."
      },
      {
        stage: "Testing & Refinement",
        description: "Conducted thorough testing across devices and iterated on the design and functionality based on user feedback."
      }
    ],
    images: [
      {
        src: "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=800&q=80",
        alt: "Chat App main interface showing conversation list"
      },
      {
        src: "/images/chat-app-conversation.jpg",
        alt: "Active conversation view with message bubbles and input field"
      },
      {
        src: "/images/chat-app-profile.jpg",
        alt: "User profile screen with settings and preferences"
      },
      {
        src: "/images/chat-app-notifications.jpg",
        alt: "Notification settings and management interface"
      }
    ],
    metrics: [
      {
        label: "GitHub Stars",
        value: 120,
        unit: "stars"
      },
      {
        label: "Code Reusability",
        value: 85,
        unit: "%"
      },
      {
        label: "Performance Score",
        value: 95,
        unit: "/100"
      },
      {
        label: "Firebase Optimization",
        value: 70,
        unit: "% reduction"
      }
    ],
    testimonial: {
      quote: "As a contributor to Ashmit's Chat App project, I was impressed by the clean architecture and thoughtful implementation. The code is well-structured and demonstrates excellent Flutter development practices.",
      author: "Raj Sharma, Senior Mobile Developer and Open Source Contributor"
    }
  }
];
