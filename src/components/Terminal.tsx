import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import './matrix.css';

type CommandResult = {
  type: 'text' | 'error' | 'list' | 'warning' | 'clear';
  content: string | string[];
};

const Terminal = () => {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ command: string; result: CommandResult }[]>([
    { 
      command: '', 
      result: { 
        type: 'text', 
        content: "Welcome to Ashmit's Terminal. Type 'help' to see available commands." 
      } 
    }
  ]);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showNukeEffect, setShowNukeEffect] = useState(false);
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.2,
  });
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const matrixContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  // Matrix animation effect
  useEffect(() => {
    if (!showMatrix || !matrixContainerRef.current) return;
    
    const container = matrixContainerRef.current;
    const terminalWindow = document.getElementById('terminal-output');
    if (!terminalWindow) return;
    
    // Clear any existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    // Set position based on scroll
    if (terminalRef.current) {
      const scrollTop = terminalRef.current.scrollTop;
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.transform = `translateY(${scrollTop}px)`;
    }
    
    // Create matrix characters
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>/?";
    const numCharacters = 300; // More characters for better coverage
    
    for (let i = 0; i < numCharacters; i++) {
      const char = document.createElement('div');
      char.className = 'matrix-character';
      char.textContent = chars[Math.floor(Math.random() * chars.length)];
      
      // Random position across entire visible area
      char.style.left = `${Math.random() * 100}%`;
      
      // Random animation delay and duration
      const duration = 1 + Math.random() * 2;
      const delay = Math.random() * 2;
      char.style.animationDuration = `${duration}s`;
      char.style.animationDelay = `${delay}s`;
      
      container.appendChild(char);
    }
    
    // Update characters
    const interval = setInterval(() => {
      container.querySelectorAll('.matrix-character').forEach(char => {
        if (Math.random() > 0.9) {
          (char as HTMLElement).textContent = chars[Math.floor(Math.random() * chars.length)];
        }
      });
    }, 100);
    
    // Run the effect for 3-5 seconds
    const duration = Math.random() * 2000 + 3000; // 3-5 seconds
    
    // Clean up
    const timer = setTimeout(() => {
      setShowMatrix(false);
      setHistory(prev => [...prev, {
        command: '',
        result: {
          type: 'warning',
          content: "HACK TERMINATED.\n\nDon't worry, you didn't actually hack anything! But your computer security knowledge is impressive."
        }
      }]);
    }, duration);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [showMatrix]);

  // Nuke animation effect
  useEffect(() => {
    if (!showNukeEffect) return;

    // Create flash element
    const flash = document.createElement('div');
    flash.className = 'nuke-flash';
    document.body.appendChild(flash);

    // Create shockwave element
    const shockwave = document.createElement('div');
    shockwave.className = 'nuke-shockwave';
    document.body.appendChild(shockwave);

    // Create sound effect
    const audio = new Audio();
    audio.src = 'https://www.soundjay.com/mechanical/sounds/explosion-01.mp3';
    audio.volume = 0.4;
    audio.play().catch(e => console.log('Audio playback prevented:', e));

    // Make elements fall
    setTimeout(() => {
      // Select random elements to make them fall
      const allElements = document.querySelectorAll('div, section, header, footer, button, h1, h2, h3, p');
      const elementsToFall = Array.from(allElements).filter(() => Math.random() > 0.6);
      
      elementsToFall.forEach(el => {
        if (el !== flash && el !== shockwave) {
          (el as HTMLElement).classList.add('element-falling');
        }
      });

      // Create aftermath black screen
      const aftermath = document.createElement('div');
      aftermath.className = 'nuke-aftermath';
      document.body.appendChild(aftermath);

      // Add message after explosion
      setTimeout(() => {
        const message = document.createElement('div');
        message.style.position = 'fixed';
        message.style.top = '50%';
        message.style.left = '50%';
        message.style.transform = 'translate(-50%, -50%)';
        message.style.color = '#ff4444';
        message.style.fontSize = '2rem';
        message.style.fontFamily = 'monospace';
        message.style.textAlign = 'center';
        message.style.zIndex = '10002';
        message.innerHTML = `
          <p>NUCLEAR MELTDOWN COMPLETE</p>
          <p style="font-size: 1.2rem; margin-top: 1rem; color: #aaa;">Reload the page to restore the site.</p>
        `;
        document.body.appendChild(message);

        // Hide all original content
        const appRoot = document.getElementById('root');
        if (appRoot) {
          appRoot.classList.add('hidden-after-nuke');
        }
      }, 3000);
    }, 1000);

    // Cleanup is not needed as we want the effect to persist until reload
  }, [showNukeEffect]);

  const handleClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const executeCommand = (cmd: string): CommandResult => {
    const lowerCmd = cmd.toLowerCase().trim();
    
    if (lowerCmd === 'help') {
      return {
        type: 'list',
        content: [
          '=== 📋 AVAILABLE COMMANDS ===',
          '',
          '-- NAVIGATION --',
          'help         Show this help menu',
          'clear        Clear the terminal',
          'about        Learn about me',
          'contact      How to reach me',
          '',
          '-- LISTING --',
          'ls           List my skills and projects',
          'ls Skills/   List all my skills in detail',
          'ls Projects/ List my projects',
          '',
          '-- VIEWING --',
          'cat resume.txt     View my resume',
          'cat skills.txt     View detailed skills',
          'cat flutter.md     View Flutter skills',
          'cat react.md       View React skills', 
          'cat swift.md       View iOS/Swift skills',
          'cat project1.md    View mobile app details',
          'cat project2.md    View web app details',
          'cat project3.md    View portfolio details',
          '',
          '-- ACTIONS --',
          'download resume    Download my resume (PDF)',
          '',
          '-- FUN --',
          'sudo ask-me-anything  Get a random fun fact',
          'hack                  Try it and see...',
          'nuke                  💥 WARNING: WILL DESTROY SITE'
        ]
      };
    } else if (lowerCmd === 'clear') {
      return {
        type: 'clear',
        content: ''
      };
    } else if (lowerCmd === 'ls') {
      return {
        type: 'list',
        content: [
          'Skills/',
          'Projects/',
          'resume.txt',
          'skills.txt',
          'contact.txt',
          'about.md'
        ]
      };
    } else if (lowerCmd === 'ls skills/' || lowerCmd === 'ls skills') {
      return {
        type: 'list',
        content: [
          'Mobile Development:',
          '  Flutter/',
          '  Swift/',
          '  SwiftUI/',
          '  Kotlin/',
          'Web Development:',
          '  React/',
          '  JavaScript/',
          '  TypeScript/',
          'Backend:',
          '  Firebase/',
          'Tools:',
          '  Git/',
          '  Figma/',
          '  Webflow/'
        ]
      };
    } else if (lowerCmd === 'ls projects/' || lowerCmd === 'ls projects') {
      return {
        type: 'list',
        content: [
          'project1.md - Mobile App',
          'project2.md - Web App',
          'project3.md - Portfolio Site'
        ]
      };
    } else if (lowerCmd === 'cat resume.txt') {
      return {
        type: 'text',
        content: `
# Ashmit Khurana
## Flutter | iOS | Front-End Web Developer

### Skills
- Mobile: Flutter, Swift, SwiftUI, Kotlin
- Web: React, JavaScript, TypeScript
- Tools: Firebase, Git, Figma, Webflow

### Experience
- Developed cross-platform mobile applications
- Created responsive web interfaces
- Implemented real-time database solutions

For more details, visit the Experience section of my portfolio.
`
      };
    } else if (lowerCmd === 'cat skills.txt') {
      return {
        type: 'text',
        content: `
# Technical Skills

## Mobile Development
- Flutter: Cross-platform app development, state management with Provider/Bloc
- iOS: Native development with Swift and SwiftUI
- Android: Native development with Kotlin and Jetpack Compose

## Web Development
- Frontend: React, JavaScript, TypeScript, HTML, CSS
- UI Frameworks: Tailwind CSS, Material UI, Bootstrap

## Backend & Databases
- Firebase: Authentication, Firestore, Cloud Functions, Storage
- RESTful API integration

## Tools & Practices
- Version Control: Git, GitHub
- Design: Figma, Adobe XD
- Deployment: App Store, Play Store
- CI/CD: GitHub Actions

## No-Code/Low-Code
- Webflow: Responsive web development
- Wix: Website building
- Shopify: E-commerce solutions
- Framer: Interactive prototypes
`
      };
    } else if (lowerCmd === 'cat flutter.md' || lowerCmd === 'cat flutter') {
      return {
        type: 'text',
        content: `
# Flutter Development

## Expertise
- Cross-platform mobile app development
- State management with Provider, Bloc, GetX
- Custom UI components and animations
- Integration with Firebase and RESTful APIs
- Platform-specific implementations

## Projects
- Created a feature-rich social media app with real-time updates
- Developed an e-commerce application with payment integration
- Built a health tracking app with custom charts and animations

## Tools
- Flutter SDK, Dart
- VS Code, Android Studio
- Firebase, RESTful APIs
- Git, GitHub Actions
`
      };
    } else if (lowerCmd === 'cat react.md' || lowerCmd === 'cat react') {
      return {
        type: 'text',
        content: `
# React Development

## Expertise
- Modern React with Hooks and Functional Components
- State management with Context API and Redux
- Next.js for server-side rendering
- Responsive designs with Tailwind CSS
- TypeScript integration

## Projects
- Built this portfolio website using React and Tailwind CSS
- Developed a dashboard application with data visualization
- Created a real-time collaboration tool

## Tools
- React, Next.js
- TypeScript
- Tailwind CSS, Styled Components
- Vercel, Netlify deployment
`
      };
    } else if (lowerCmd === 'cat swift.md' || lowerCmd === 'cat swift' || lowerCmd === 'cat swiftui.md' || lowerCmd === 'cat swiftui') {
      return {
        type: 'text',
        content: `
# iOS Development with Swift & SwiftUI

## Expertise
- Native iOS application development
- UI/UX implementation with SwiftUI
- CoreData and UserDefaults for local storage
- Integration with Firebase and RESTful APIs
- Push notifications and deep linking

## Projects
- Developed a productivity app with iCloud sync
- Created a content delivery application with custom animations
- Built utility applications for daily use

## Tools
- Swift, SwiftUI, UIKit
- Xcode
- Core Data, Core Animation
- App Store Connect
`
      };
    } else if (lowerCmd === 'cat project1.md' || lowerCmd === 'cat project1') {
      return {
        type: 'text',
        content: `
# Mobile App Project

## Overview
A cross-platform mobile application built with Flutter that helps users track their daily activities and set goals.

## Technologies Used
- Flutter & Dart
- Firebase (Authentication, Firestore, Storage)
- Provider for state management
- Custom animations and charts

## Features
- User authentication and profile management
- Daily activity tracking and goal setting
- Data visualization with interactive charts
- Social sharing capabilities
- Push notifications for reminders

## Outcome
The app has been downloaded by over 10,000 users with an average rating of 4.7 stars.
`
      };
    } else if (lowerCmd === 'cat project2.md' || lowerCmd === 'cat project2') {
      return {
        type: 'text',
        content: `
# Web App Project

## Overview
A responsive web application that serves as a dashboard for businesses to monitor their key performance indicators.

## Technologies Used
- React with TypeScript
- Tailwind CSS for styling
- Chart.js for data visualization
- Firebase for backend services

## Features
- Real-time data updates
- Interactive charts and graphs
- User role management
- Data export capabilities
- Responsive design for all device sizes

## Outcome
Increased client productivity by 35% by providing a centralized platform for data analysis and reporting.
`
      };
    } else if (lowerCmd === 'cat project3.md' || lowerCmd === 'cat project3') {
      return {
        type: 'text',
        content: `
# Portfolio Website

## Overview
A personal portfolio website showcasing my skills, projects, and experience.

## Technologies Used
- React with TypeScript
- Tailwind CSS for styling
- Framer Motion for animations
- Vercel for deployment

## Features
- Interactive terminal interface
- Responsive design
- Custom animations and transitions
- Project showcase with detailed descriptions
- Contact form with validation

## Outcome
Created a unique and engaging way to present my professional experience and technical abilities.
`
      };
    } else if (lowerCmd === 'about') {
      return {
        type: 'text',
        content: "I'm a B.Tech undergrad student in Computer Science and Engineering, passionate about creating innovative mobile and web solutions. I specialize in Flutter, iOS, and front-end web development."
      };
    } else if (lowerCmd === 'contact') {
      return {
        type: 'text',
        content: "Email: ashmit.khu@gmail.com\nGitHub: github.com/ashmitkhurana\nLinkedIn: linkedin.com/in/ashmitkhurana"
      };
    } else if (lowerCmd === 'sudo ask-me-anything') {
      const funFacts = [
        "I wrote my first line of code at the age of 12!",
        "My favorite programming language is TypeScript.",
        "I've contributed to open-source projects like X and Y.",
        "I can solve a Rubik's cube in under 2 minutes.",
        "My dream project is building a comprehensive health-tracking application."
      ];
      return {
        type: 'text',
        content: funFacts[Math.floor(Math.random() * funFacts.length)]
      };
    } else if (lowerCmd === 'hack') {
      // First turn off any existing animation
      setShowMatrix(false);
      
      // Use a small timeout to ensure state update completes
      setTimeout(() => {
        // Make sure the terminal is scrolled to the correct position
        if (terminalRef.current) {
          // We want the hack command to be visible
          const currentScrollPos = terminalRef.current.scrollTop;
          
          // Ensure we're showing the current command in the view
          // but don't auto-scroll to bottom if user has scrolled up
          if (currentScrollPos < terminalRef.current.scrollHeight - terminalRef.current.clientHeight) {
            // Only force scroll if we're near the bottom already
            const nearBottom = terminalRef.current.scrollHeight - currentScrollPos - terminalRef.current.clientHeight < 200;
            if (nearBottom) {
              terminalRef.current.scrollTop = terminalRef.current.scrollHeight - terminalRef.current.clientHeight;
            }
          }
        }
        
        // Then start the animation fresh
        setShowMatrix(true);
      }, 10);
      
      return {
        type: 'warning',
        content: "INITIATING HACK SEQUENCE..."
      };
    } else if (lowerCmd === 'nuke') {
      // Confirm if user really wants to nuke the site
      return {
        type: 'warning',
        content: "⚠️ WARNING: This will completely destroy the website until you reload.\nType 'nuke confirm' to proceed or any other command to cancel."
      };
    } else if (lowerCmd === 'nuke confirm') {
      setTimeout(() => {
        setShowNukeEffect(true);
      }, 500);
      
      return {
        type: 'error',
        content: "☢️ NUCLEAR LAUNCH SEQUENCE INITIATED!\n\nTAKE COVER!"
      };
    } else if (lowerCmd === 'download resume') {
      // Create an anchor element and trigger download
      const link = document.createElement('a');
      link.href = '/resume.pdf'; // Path to the resume PDF
      link.download = 'Ashmit_Khurana_Resume.pdf';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return {
        type: 'text',
        content: "✅ Downloading resume... If the download doesn't start automatically, check your browser's download settings or try again."
      };
    } else {
      return {
        type: 'error',
        content: `Command not found: ${cmd}. Type 'help' to see available commands.`
      };
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const result = executeCommand(command);
    
    if (result.type === 'clear') {
      setHistory([
        { 
          command: '', 
          result: { 
            type: 'text', 
            content: "Welcome to Ashmit's Terminal. Type 'help' to see available commands." 
          } 
        }
      ]);
    } else {
      setHistory([...history, { command, result }]);
    }
    
    setCommand('');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-6">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 50 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8 }}
        className="w-full max-w-6xl"
      >
        <div className="text-center mb-6">
          <h2 className="text-4xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Terminal
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Interact with my portfolio through this terminal interface. Type 'help' to see available commands.
          </p>
        </div>

        <div 
          id="terminal-container"
          className="bg-[#0a0a0a] border border-gray-700 rounded-lg shadow-lg overflow-hidden transition-all duration-300"
          onClick={handleClick}
        >
          <div className="flex items-center bg-gray-800 px-4 py-2 border-b border-gray-700">
            <div className="flex space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="mx-auto text-sm text-gray-400">ashmit@portfolio:~</div>
          </div>
          
          <div 
            id="terminal-output"
            ref={terminalRef}
            className="p-6 h-[550px] overflow-y-auto font-mono text-sm relative"
          >
            {showMatrix && (
              <div 
                ref={matrixContainerRef} 
                className="matrix-container"
              ></div>
            )}
            {history.map((item, i) => (
              <div key={i} className="mb-2">
                {item.command && (
                  <div className="flex">
                    <span className="text-green-500">ashmit@portfolio:~$</span>
                    <span className="ml-2 text-white">{item.command}</span>
                  </div>
                )}
                <div className={`mt-1 ${
                  item.result.type === 'error' ? 'text-red-400' : 
                  item.result.type === 'warning' ? 'text-yellow-400' : 
                  'text-gray-300'
                }`}>
                  {Array.isArray(item.result.content) ? (
                    item.command === 'help' ? (
                      <div className="flex flex-col space-y-0.5">
                        {(item.result.content as string[]).map((line, j) => (
                          <div key={j} className={line.startsWith('===') ? 'text-blue-400 font-bold mt-1' : 
                                                line.startsWith('--') ? 'text-purple-400 font-semibold mt-2' : 
                                                line === '' ? 'h-1' : 'pl-2'}>
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {(item.result.content as string[]).map((line, j) => (
                          <div key={j}>{line}</div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="whitespace-pre-wrap">{item.result.content}</div>
                  )}
                </div>
              </div>
            ))}
            <form onSubmit={handleSubmit} className="flex mt-2">
              <span className="text-green-500 shrink-0">ashmit@portfolio:~$</span>
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="ml-2 bg-transparent border-none outline-none text-white w-full"
              />
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Terminal; 