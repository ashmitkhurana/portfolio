import { Github, Linkedin, Instagram } from 'lucide-react';
import { motion } from 'framer-motion';

const Footer = () => {
  return (
    <footer className="py-8 bg-[#0c0c0c]">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 mb-4 md:mb-0">
            © {new Date().getFullYear()} Ashmit Khurana. All rights reserved.
          </p>
          <div className="flex space-x-6">
            {[
              { Icon: Github, href: "https://github.com/ashmitkhurana" },
              { Icon: Linkedin, href: "https://linkedin.com/in/ashmitkhurana" },
              { Icon: Instagram, href: "https://www.instagram.com/ashmitkhurana_/" }
            ].map(({ Icon, href }, index) => (
              <motion.a
                key={index}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white relative group"
                whileHover={{
                  scale: 1.2,
                  filter: "brightness(1.5)",
                }}
              >
                <Icon size={24} className="relative z-10" />
                <motion.div
                  className="absolute inset-0 bg-blue-500 rounded-full opacity-0 group-hover:opacity-20 blur-lg"
                  initial={false}
                  animate={{
                    scale: [1, 1.5, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                />
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;