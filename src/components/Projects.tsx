import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Github, ExternalLink } from 'lucide-react';
import { lazy, Suspense } from 'react';

const LazyImage = lazy(() => import('../components/LazyImage'));

const projects = [
  {
    title: "Chat App",
    description: "A real-time chat application built with Flutter and Firebase",
    image: "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=800&q=80",
    tags: ["Flutter", "Firebase", "Dart"],
    github: "https://github.com/ashmitkhurana/ChatApp-Flutter",
    live: "#"
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
    title: "Monktechnology.net",
    description: "A modern business website showcasing development and design excellence for creators, featuring a dynamic 3D interface and seamless user experience.",
    image: "/images/monk-tech.png",
    tags: ["WIX", "Web Development", "UI/UX", "3D Design"],
    github: "#",
    live: "https://monktechnology.net"
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
          {projects.map((project, index) => (
            <motion.div
              key={project.title}
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className="bg-glass rounded-xl overflow-hidden group hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.2)] transition-all duration-300"
            >
              <div className="relative overflow-hidden">
                <Suspense fallback={<div className="w-full h-48 bg-blue-500/10 animate-pulse rounded-t-xl" />}>
                  <LazyImage
                    src={project.image}
                    alt={project.title}
                    className={`w-full h-48 object-cover transform transition-transform duration-500 ${
                      project.title === "Portfolio Website" || project.title === "Monktechnology.net" 
                      ? "scale-110 group-hover:scale-125" 
                      : "group-hover:scale-110"
                    }`}
                  />
                </Suspense>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
              <div className="p-6">
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
                <div className="flex gap-4">
                  {project.title === "Monktechnology.net" ? (
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
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;