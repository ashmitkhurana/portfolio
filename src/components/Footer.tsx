import { Github, Linkedin, Twitter } from 'lucide-react';

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
              { Icon: Github, href: "https://github.com/ashmit" },
              { Icon: Linkedin, href: "https://linkedin.com/in/ashmit" },
              { Icon: Twitter, href: "https://twitter.com/ashmit" }
            ].map(({ Icon, href }, index) => (
              <a
                key={index}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transform hover:scale-110 transition-all duration-300"
              >
                <Icon size={20} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;