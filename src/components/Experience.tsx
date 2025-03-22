import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Briefcase, Users } from 'lucide-react';

const Experience = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  const experiences = [
    {
      Icon: Briefcase,
      title: "MonkT",
      role: "Web Developer",
      period: "Dec 2023 - Jan 2024",
      description: (
        <>
          Developed & deployed{' '}
          <a 
            href="https://monktechnology.net" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-500 hover:text-blue-400"
          >
            monktechnology.net
          </a>
          {' '}using WIX Website Builder
        </>
      ),
      type: "internship"
    },
    {
      Icon: Briefcase,
      title: "MonkT",
      role: "Flutter Developer",
      period: "Jan 2023 - Dec 2023",
      description: "Developed cross-platform mobile applications using Flutter, focusing on creating responsive and user-friendly interfaces.",
      type: "internship"
    },
    {
      Icon: Briefcase,
      title: "ProjectDegree",
      role: "Content Creation Intern",
      period: "May 2023 - Oct 2023",
      description: "Created and edited video content for social media platforms, focusing on educational content and student engagement.",
      type: "internship"
    },
    {
      Icon: Users,
      title: "Google Developer Student Clubs",
      role: "Technical Coordinator",
      period: "Jan 2023 - Mar 2023",
      description: "Leading technical initiatives and coordinating developer activities",
      type: "volunteer"
    }
  ];

  return (
    <section id="experience" className="py-24 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Experience
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            My professional journey and contributions to various organizations.
          </p>
        </motion.div>

        <div className="grid gap-6">
          {experiences.map(({ Icon, title, role, period, description, type }, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -50 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className="bg-glass rounded-xl p-6 backdrop-blur-lg"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-semibold">{title}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      type === 'work' ? 'bg-blue-500/10 text-blue-500' :
                      type === 'internship' ? 'bg-purple-500/10 text-purple-500' :
                      'bg-green-500/10 text-green-500'
                    }`}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                  </div>
                  <h4 className="text-lg text-gray-300 mb-1">{role}</h4>
                  <p className="text-gray-400 mb-2">{period}</p>
                  <p className="text-gray-400">{description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Experience;