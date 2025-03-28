import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Smartphone, Globe } from 'lucide-react';

interface LogoProps {
  className?: string;
  style?: React.CSSProperties;
}

const AppleLogo: React.FC<LogoProps> = ({ className, style }) => (
  <svg viewBox="0 0 384 512" className={className} style={style}>
    <path
      fill="currentColor"
      d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
    />
  </svg>
);

const About = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  return (
    <section id="about" className="py-20 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            About Me
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            I'm a B.Tech undergrad student in Computer Science and Engineering, 
            passionate about creating innovative mobile and web solutions. I specialize 
            in Flutter, iOS, and front-end web development.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              Icon: Smartphone,
              title: "Flutter Developer",
              description: "Building cross-platform mobile applications with Flutter, creating beautiful and performant user experiences",
            },
            {
              Icon: AppleLogo,
              title: "iOS Developer",
              description: "Developing native iOS applications using Swift and SwiftUI, focusing on Apple's design principles",
            },
            {
              Icon: Globe,
              title: "Front End Web Developer",
              description: "Creating responsive and interactive web applications using React, TypeScript, and modern web technologies",
            },
          ].map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className="bg-glass rounded-xl p-6 backdrop-blur-lg hover:scale-105 hover:shadow-[0_8px_50px_-12px_rgba(71,73,115,0.5)] transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-[#474973]/10 flex items-center justify-center mb-4">
                  <item.Icon className={`w-8 h-8 ${item.Icon === AppleLogo ? 'text-white' : 'text-blue-500'}`} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default About;