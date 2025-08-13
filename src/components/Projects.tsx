import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Github, ExternalLink } from 'lucide-react';
import { lazy, Suspense } from 'react';
import SpotlightCard from './Card';

const LazyImage = lazy(() => import('../components/LazyImage'));

const projects = [
  {
    title: "NerdWithABindi",
    description: "A collaboration platform for influencers to connect, share resources, and coordinate campaigns. Streamlines partnership opportunities and content creation through an intuitive interface.",
    image: "/images/nerdwithabindi.png",
    tags: ["React", "Next.js", "Google Form", "HTML", "CSS"],
    github: "#",
    live: "#"
  },
  {
    title: "Sleepara",
    description: "A comprehensive sleep health platform that connects users with sleep apnea specialists, provides AI-powered sleep advice, and locates nearby pharmacies for CPAP supplies. Designed to make sleep healthcare more accessible and personalized.",
    image: "/images/sleepara.png",
    tags: ["Shopify", "Stripe", "Link", "React", "Next.js", "Custom AI"],
    github: "#",
    live: "https://sleepara.com/"
  },
  {
    title: "Arcadia Design",
    description: "A modern and visually striking portfolio website for Arcadia Design, a Canadian architecture firm. The site highlights their innovative projects, design philosophy, and expertise, offering an immersive experience for potential clients and collaborators.",
    image: "/images/arcadia.png",
    tags: ["HTML", "CSS", "JavaScript", "Tailwind CSS", "TypeScript"],
    github: "#",
    live: "https://www.arcadiadesignsinc.com/"
  },
  {
    title: "Bellarisse",
    description: "A beautifully crafted e-commerce platform for Bellarisse, an Indian luxury handbag startup. The website combines elegant design with smooth shopping experiences, showcasing premium collections and providing a seamless journey from browsing to checkout.",
    image: "/images/bellarisse.png",
    tags: ["Framer", "Shopify"],
    github: "#",
    live: "https://www.bellarisse.com/"
  },
  {
    title: "EventSync (TechSprint48 Hackathon)",
    description: "A one-stop solution for seamless event creation and management, EventSync empowers users to organize events effortlessly, manage RSVPs, and gain actionable analytics for better engagement and planning.",
    image: "/images/eventsync.png",
    tags: ["HTML", "CSS", "JavaScript", "TypeScript", "React", "MongoDB", "Mongoose"],
    github: "https://github.com/ashmitkhurana/EventSync",
    live: "#"
  },
  {
    title: "Monktechnology.net",
    description: "A modern business website showcasing development and design excellence for creators, featuring a dynamic 3D interface and seamless user experience.",
    image: "/images/monk-tech.png",
    tags: ["WIX", "Web Development", "UI/UX", "3D Design"],
    github: "#",
    live: "https://monktechnology.net"
  },
  {
    title: "Portfolio Website",
    description: "Modern personal portfolio featuring interactive 3D animations, smooth transitions, and responsive design built with React and Spline.",
    image: "/images/portfolio.png",
    tags: ["React", "Tailwind CSS", "TypeScript", "Spline"],
    github: "https://github.com/ashmitkhurana/portfolio",
    live: "#"
  },
  {
    title: "Chat App",
    description: "A real-time chat application built with Flutter and Firebase",
    image: "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=800&q=80",
    tags: ["Flutter", "Firebase", "Dart"],
    github: "https://github.com/ashmitkhurana/ChatApp-Flutter",
    live: "#"
  }
];

const Projects = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section id="projects" className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Projects
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {projects.map((project) => (
            <SpotlightCard
              key={project.title}
              className="custom-spotlight-card group"
              spotlightColor="rgba(0, 229, 255, 0.2)"
            >
              <div className="rounded-xl overflow-hidden transition-all duration-300 flex flex-col h-full bg-transparent" style={{ background: 'none', boxShadow: 'none' }}>
                <div className="relative overflow-hidden">
                  <Suspense fallback={<div className="w-full h-48 bg-blue-500/10 animate-pulse rounded-t-xl" />}>
                    <LazyImage
                      src={project.image}
                      alt={project.title}
                      className={"project-card-image w-full h-48 object-cover"}
                    />
                  </Suspense>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="text-xl font-semibold mb-2">{project.title}</h3>
                  <p className="text-gray-400 mb-4">{project.description}</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {project.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-auto">
                    {(project.title === "Monktechnology.net" || project.title === "Bellarisse" || project.title === "Arcadia Design" || project.title === "Sleepara" || project.title === "NerdWithABindi") ? (
                      <a
                        href={project.live}
                        className="text-gray-400 hover:text-white transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-6 h-6" />
                      </a>
                    ) : (
                      <a
                        href={project.github}
                        className="text-gray-400 hover:text-white transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Github className="w-6 h-6" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;