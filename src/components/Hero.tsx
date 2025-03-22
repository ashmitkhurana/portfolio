import { motion, useScroll, useTransform } from 'framer-motion';
import { Github, Linkedin, Instagram, ChevronDown } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

// Add type declaration for spline-viewer
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'spline-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        url: string;
      }, HTMLElement>;
    }
  }
}

const Hero = () => {
  const containerRef = useRef(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 100]);

  useEffect(() => {
    // Check if script is already loaded
    if (document.querySelector('script[src*="spline-viewer.js"]')) {
      setIsScriptLoaded(true);
      return;
    }

    // Load Spline viewer script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@splinetool/viewer@1.9.80/build/spline-viewer.js';
    script.type = 'module';
    script.async = true;
    
    script.onload = () => setIsScriptLoaded(true);
    script.onerror = () => console.error('Failed to load Spline viewer script');
    
    document.body.appendChild(script);

    return () => {
      const scriptElement = document.querySelector('script[src*="spline-viewer.js"]');
      if (scriptElement) {
        document.body.removeChild(scriptElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0a0a0a]">
      {/* Spline Background */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        {isScriptLoaded && (
          <spline-viewer url="https://prod.spline.design/NLYCUfNZpAi3Ti9g/scene.splinecode"></spline-viewer>
        )}
      </div>

      {/* Content with dark overlay */}
      <div className="absolute inset-0 bg-[#0a0a0a]/30 z-[1] pointer-events-none" />
      
      {/* Content */}
      <motion.div 
        style={{ y, scale }} 
        className="relative z-10 text-center px-4 max-w-full pointer-events-auto"
      >
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-gray-400 text-lg md:text-xl mb-4 font-light tracking-wider"
        >
          Hello, I'm
        </motion.h2>
        
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="relative"
        >
          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              backgroundSize: '300% 300%',
            }}
          >
            Ashmit Khurana
          </motion.h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-lg sm:text-xl md:text-2xl text-gray-300 mb-8 relative px-4"
        >
          <span className="font-light">Building the Future of Mobile,</span>
          <br />
          <motion.span 
            className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              backgroundSize: '200% 200%',
            }}
          >
            One App at a Time
          </motion.span>
        </motion.div>

        {/* Social Links with hover effects */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex justify-center space-x-6"
        >
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
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{
            y: [0, 10, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: "reverse"
          }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-gray-400 text-sm">Scroll Down</span>
          <ChevronDown className="w-6 h-6 text-gray-400" />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Hero;