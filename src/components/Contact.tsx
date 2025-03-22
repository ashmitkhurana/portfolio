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
    <section id="contact" className="py-20">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Get in Touch
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Have a project in mind? Let's work together to create something amazing.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="flex flex-col space-y-12 max-w-2xl mx-auto"
        >
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => window.location.href = 'mailto:ashmit.khu@gmail.com'}
              className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center hover:bg-blue-500/20 transition-colors duration-200"
            >
              <Mail className="w-6 h-6 text-blue-500" />
            </button>
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">Email</h3>
              <a href="mailto:ashmit.khu@gmail.com" className="text-gray-400 hover:text-blue-500 transition-colors break-all">
                ashmit.khu@gmail.com
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-6">
              {socialLinks.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center hover:bg-blue-500/20 transition-colors duration-200"
                  aria-label={label}
                >
                  <Icon className="w-6 h-6 text-blue-500" />
                </a>
              ))}
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">Social Media</h3>
              <p className="text-gray-400">Connect with me on social platforms</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Contact;