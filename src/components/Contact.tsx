import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Mail, Github, Linkedin, Instagram, FileText } from 'lucide-react';
import FlipLink from './text-flipper';

const Contact = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  return (
    <section id="contact" className="py-20 w-full">
      <div className="container mx-auto px-4 flex flex-col items-center justify-center">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 w-full max-w-2xl"
        >
          <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Get in Touch
          </h2>
          <p className="text-gray-400 text-lg">
            Have a project in mind? Let's work together to create something amazing.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="flex flex-col gap-10 w-full max-w-3xl"
        >

          <div className="flex flex-col items-center gap-6">
            <motion.div 
              className="flex flex-col gap-6 items-center"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="flex flex-col gap-6 items-center">
                <div className="flex items-center gap-4">
                  <FlipLink
                    href="https://linkedin.com/in/ashmitkhurana"
                    icon={<Linkedin className="w-8 h-8" />}
                    iconBg="#e5e7eb"
                    iconHoverBg="#0077b5"
                    iconColor="#111"
                    iconHoverColor="#fff"
                    iconPosition="right"
                  >
                    LINKEDIN
                  </FlipLink>
                </div>
                <div className="flex items-center gap-4">
                  <FlipLink
                    href="https://github.com/ashmitkhurana"
                    icon={<Github className="w-8 h-8" />}
                    iconBg="#e5e7eb"
                    iconHoverBg="#111"
                    iconColor="#111"
                    iconHoverColor="#fff"
                    iconPosition="left"
                  >
                    GITHUB
                  </FlipLink>
                </div>
                <div className="flex items-center gap-4">
                  <FlipLink
                    href="https://www.instagram.com/ashmitkhurana_/"
                    icon={<Instagram className="w-8 h-8" />}
                    iconBg="#e5e7eb"
                    iconHoverBg="#e1306c"
                    iconColor="#111"
                    iconHoverColor="#fff"
                    iconPosition="right"
                  >
                    INSTAGRAM
                  </FlipLink>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <motion.a
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              href="mailto:ashmit.khu@gmail.com"
              className="px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 flex items-center gap-2 transition-all duration-300 hover:scale-105"
            >
              <Mail className="w-5 h-5" />
              Email
            </motion.a>

            <motion.a
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.6 }}
              href="/Resume Ashmit Khurana.pdf"
              download="Ashmit_Khurana_Resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 flex items-center gap-2 transition-all duration-300 hover:scale-105"
            >
              <FileText className="w-5 h-5" />
              Download Resume
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Contact;