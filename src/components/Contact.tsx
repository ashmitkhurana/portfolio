import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Mail, Github, Linkedin, Instagram } from 'lucide-react';

const Contact = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });

  const socialLinks = [
    {
      Icon: Github,
      href: "https://github.com/ashmitkhurana",
      label: "GitHub"
    },
    {
      Icon: Linkedin,
      href: "https://linkedin.com/in/ashmitkhurana",
      label: "LinkedIn"
    },
    {
      Icon: Instagram,
      href: "https://www.instagram.com/ashmitkhurana_/",
      label: "Instagram"
    }
  ];

  return (
    <section id="contact" className="py-16 w-full">
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
          className="flex flex-col space-y-8 w-full max-w-sm"
        >
          <div className="flex flex-col items-center gap-3">
            <motion.button
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              onClick={() => window.location.href = 'mailto:ashmit.khu@gmail.com'}
              className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center hover:bg-blue-500/20 transition-colors duration-200"
            >
              <Mail className="w-5 h-5 text-blue-500" />
            </motion.button>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-center"
            >
              <h3 className="text-base font-semibold mb-0.5">Email</h3>
              <a href="mailto:ashmit.khu@gmail.com" className="text-gray-400 hover:text-blue-500 transition-colors break-all">
                ashmit.khu@gmail.com
              </a>
            </motion.div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <motion.div 
              className="flex gap-4"
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {socialLinks.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center hover:bg-blue-500/20 transition-colors duration-200"
                  aria-label={label}
                >
                  <Icon className="w-5 h-5 text-blue-500" />
                </a>
              ))}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-center"
            >
              <h3 className="text-base font-semibold mb-0.5">Social Media</h3>
              <p className="text-gray-400">Connect with me on social platforms</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Contact;