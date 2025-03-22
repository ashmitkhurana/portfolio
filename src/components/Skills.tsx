import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Code2, Smartphone, Globe, Database, GitBranch, Layout, Palette, Store, Sparkles, Boxes } from 'lucide-react';

interface LogoProps {
  className?: string;
  style?: React.CSSProperties;
}

const FlutterLogo: React.FC<LogoProps> = ({ className, style }) => (
  <img 
    src="https://img.icons8.com/color/512/flutter.png" 
    alt="Flutter" 
    className={`w-12 h-12 ${className}`}
    style={style}
  />
);

const AppleLogo: React.FC<LogoProps> = ({ className, style }) => (
  <svg viewBox="0 0 384 512" className={`w-8 h-8 text-white ${className}`} style={style}>
    <path
      fill="currentColor"
      d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
    />
  </svg>
);

const SplineLogo: React.FC<LogoProps> = ({ className, style }) => (
  <Boxes className={`w-8 h-8 text-white ${className}`} style={style} />
);

const Skills = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  const skills = [
    {
      Icon: FlutterLogo,
      title: "Flutter",
      description: "Cross-platform mobile app development with Flutter, creating beautiful and performant applications for both iOS and Android platforms.",
    },
    {
      Icon: AppleLogo,
      title: "Swift",
      description: "Native iOS development using Swift and SwiftUI, building high-performance applications following Apple's design guidelines.",
    },
    {
      Icon: Smartphone,
      title: "Android Development",
      description: "Native Android app development using Kotlin and Jetpack Compose, creating responsive and user-friendly mobile applications.",
    },
    {
      Icon: Globe,
      title: "React",
      description: "Modern web development with React, creating responsive and interactive user interfaces with component-based architecture.",
    },
    {
      Icon: Code2,
      title: "JavaScript",
      description: "Dynamic web development with JavaScript, building interactive and responsive applications with modern ES6+ features.",
    },
    {
      Icon: Database,
      title: "Firebase",
      description: "Backend development and real-time data management using Firebase, implementing authentication, cloud storage, and real-time databases.",
    },
    {
      Icon: GitBranch,
      title: "Git",
      description: "Version control and collaborative development using Git, managing code repositories and implementing efficient workflows.",
    }
  ];

  const tools = [
    {
      Icon: Layout,
      title: "Webflow",
      description: "No-code web development using Webflow, creating responsive and interactive websites with custom animations and interactions.",
    },
    {
      Icon: Palette,
      title: "Figma",
      description: "UI/UX design and prototyping using Figma, creating user-centered designs and interactive prototypes for web and mobile applications.",
    },
    {
      Icon: Store,
      title: "Wix",
      description: "Website development and e-commerce solutions using Wix, building professional websites with integrated business tools.",
    },
    {
      Icon: Sparkles,
      title: "Framer",
      description: "Interactive prototyping and web development with Framer, creating high-fidelity prototypes and responsive websites.",
    },
    {
      Icon: Store,
      title: "Shopify",
      description: "E-commerce development using Shopify, building online stores with custom themes and integrated payment solutions.",
    },
    {
      Icon: SplineLogo,
      title: "Spline",
      description: "3D design and interactive web experiences using Spline, creating immersive 3D content and animations for web applications.",
    }
  ];

  return (
    <section id="skills" className="py-20 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Skills
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            A comprehensive overview of my technical skills and expertise in various technologies.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {skills.map(({ Icon, title, description }, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              className="bg-glass rounded-xl p-6 backdrop-blur-lg hover:scale-105 hover:shadow-[0_8px_50px_-12px_rgba(59,130,246,0.5)] transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                  <Icon />
                </div>
                <h3 className="text-xl font-semibold mb-2">{title}</h3>
                <p className="text-gray-400">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Tools
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Additional tools and platforms I work with to create comprehensive digital solutions.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {tools.map(({ Icon, title, description }, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              className="bg-glass rounded-xl p-6 backdrop-blur-lg hover:scale-105 hover:shadow-[0_8px_50px_-12px_rgba(59,130,246,0.5)] transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                  <Icon />
                </div>
                <h3 className="text-xl font-semibold mb-2">{title}</h3>
                <p className="text-gray-400">{description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Skills;