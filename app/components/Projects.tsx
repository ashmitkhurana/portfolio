"use client";

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Github, ExternalLink } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import SpotlightCard from './Card';

const LazyImage = lazy(() => import('./LazyImage'));

const projectsData = [
  {
    title: "NerdWithABindi",
    slug: "nerdwithabindi",
    description: "Empowering influencers through collaborative connection and resource sharing",
    image: "/images/nerdwithabindi.png",
    tags: ["React", "Next.js", "Google Forms"],
    live: "https://nerdwithabindi.com",
    github: "https://github.com/ashmitkhurana"
  },
  {
    title: "Sleepara",
    slug: "sleepara",
    description: "Revolutionizing sleep health through personalized care and accessible resources",
    image: "/images/sleepara.png",
    tags: ["Shopify", "Stripe", "React"],
    live: "https://sleepara.com",
    github: "https://github.com/ashmitkhurana"
  },
  {
    title: "Arcadia Design",
    slug: "arcadia-design",
    description: "Showcasing architectural excellence through immersive digital experiences",
    image: "/images/arcadia.png",
    tags: ["HTML", "CSS", "TypeScript"],
    live: "https://arcadiadesign.ca",
    github: "https://github.com/ashmitkhurana"
  },
  {
    title: "Bellarisse",
    slug: "bellarisse",
    description: "Elevating luxury handbag shopping through elegant digital experiences",
    image: "/images/bellarisse.png",
    tags: ["Framer", "Shopify", "Liquid"],
    live: "https://bellarisse.com",
    github: "https://github.com/ashmitkhurana"
  },
  {
    title: "EventSync",
    slug: "eventsync",
    description: "Simplifying event management through intelligent automation and analytics",
    image: "/images/eventsync.png",
    tags: ["React", "MongoDB", "Express"],
    live: "",
    github: "https://github.com/ashmitkhurana/eventsync"
  },
  {
    title: "Monktechnology.net",
    slug: "monk-technology",
    description: "Showcasing digital excellence through immersive 3D experiences",
    image: "/images/monk-tech.png",
    tags: ["WIX", "Velo", "JavaScript"],
    live: "https://monktechnology.net",
    github: ""
  },
  {
    title: "Portfolio Website",
    slug: "portfolio-website",
    description: "Showcasing creative work through interactive design and seamless experiences",
    image: "/images/portfolio.png",
    tags: ["React", "Tailwind", "Framer Motion"],
    live: "",
    github: "https://github.com/ashmitkhurana/portfolio"
  },
  {
    title: "Chat App",
    slug: "chat-app",
    description: "Enabling real-time communication through a seamless mobile experience",
    image: "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=800&q=80",
    tags: ["Flutter", "Firebase", "Dart"],
    live: "",
    github: "https://github.com/ashmitkhurana/chat-app"
  }
];

const Projects = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });
  const router = useRouter();

  const handleProjectClick = (slug: string) => {
    router.push(`/projects/${slug}`);
  };

  return (
    <section id="projects" className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Projects
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projectsData.map((project) => (
            <div 
              key={project.title} 
              onClick={() => handleProjectClick(project.slug)}
              className="h-full cursor-pointer"
            >
              <SpotlightCard
                className="custom-spotlight-card group h-full"
                spotlightColor="rgba(0, 229, 255, 0.2)"
              >
                <div className="rounded-xl overflow-hidden transition-all duration-300 flex flex-col h-full bg-transparent" style={{ background: 'none', boxShadow: 'none' }}>
                  <div className="relative overflow-hidden h-48">
                    <Suspense fallback={<div className="w-full h-48 bg-blue-500/10 animate-pulse rounded-t-xl" />}>
                      <LazyImage
                        src={project.image}
                        alt={project.title}
                        className="project-card-image w-full h-48 object-cover"
                      />
                    </Suspense>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="text-xl font-semibold mb-2 line-clamp-1">{project.title}</h3>
                    <p className="text-gray-400 mb-4 line-clamp-3 h-18">{project.description}</p>
                    <div className="flex flex-wrap gap-2 mb-4 min-h-[40px]">
                      {project.tags.map(tag => (
                        <span
                          key={tag}
                          className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-auto pt-2">
                      {(project.title === "Monktechnology.net" || project.title === "Bellarisse" || project.title === "Arcadia Design" || project.title === "Sleepara" || project.title === "NerdWithABindi") ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(project.live, '_blank');
                          }}
                          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-6 h-6" />
                        </span>
                      ) : project.github ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(project.github, '_blank');
                          }}
                          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <Github className="w-6 h-6" />
                        </span>
                      ) : null}
                      <span className="text-blue-400 ml-auto">View Case Study →</span>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;