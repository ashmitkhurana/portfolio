import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { GraduationCap } from 'lucide-react';

const Education = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  const education = [
    {
      Icon: GraduationCap,
      title: "Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow",
      role: "B.Tech in Computer Science Engineering (CSE-AIML)",
      period: "Oct 2022 - June 2026",
      type: "education"
    },
    {
      Icon: GraduationCap,
      title: "Veda Vyasa D.A.V Public School, India",
      role: "12th CBSE Board - Science (Non-Medical)",
      period: "April 2021 - July 2022",
      type: "education"
    }
  ];

  return (
    <section id="education" className="py-24 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Education
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            My academic journey and qualifications.
          </p>
        </motion.div>

        <div className="grid gap-6">
          {education.map(({ Icon, title, role, period, type }, index) => (
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
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-500">
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                  </div>
                  <h4 className="text-lg text-gray-300 mb-1">{role}</h4>
                  <p className="text-gray-400">{period}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Education; 