import { motion } from 'framer-motion';
import { Github, Linkedin, Instagram } from 'lucide-react';
import React, { useRef } from 'react';
import Squares from './Squares';

// Remove Spline type declaration, state, useEffect, and Spline-related JSX

// Remove the entire SquaresBackground component definition and any related code

const Hero = () => {
  const containerRef = useRef(null);

  return (
    <div ref={containerRef} className="relative min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      {/* Animated Squares Background as true background */}
      <div className="absolute inset-0 z-0 pointer-events-auto w-full h-full">
        <Squares speed={0.5} squareSize={40} direction="diagonal" borderColor="#fff" hoverFillColor="#5a1fa2" />
      </div>
      {/* Content with dark overlay */}
      <div className="absolute inset-0 bg-[#0a0a0a]/30 z-[1] pointer-events-none" />
      {/* Content */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center pointer-events-none">
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
          <span className="font-light">Pixel Playmaker</span>
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
            Code Conjurer
          </motion.span>
        </motion.div>

        {/* Social Links with hover effects */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex justify-center space-x-6 pointer-events-auto"
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
              className="relative group"
              whileHover={{
                scale: 1.2,
                filter: "brightness(1.5)",
              }}
            >
              <Icon size={40} className="relative z-10 text-blue-500" />
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full opacity-0 group-hover:opacity-20 blur-lg"
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
      </div>
    </div>
  );
};

export default Hero;