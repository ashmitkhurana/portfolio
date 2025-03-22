import React from 'react';
import { ParallaxProvider } from 'react-scroll-parallax';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import About from './components/About';
import Skills from './components/Skills';
import Projects from './components/Projects';
import Experience from './components/Experience';
import Contact from './components/Contact';
import Footer from './components/Footer';

function App() {
  return (
    <ParallaxProvider>
      <div className="bg-[#0a0a0a] text-white">
        <Navbar />
        <section id="home">
          <Hero />
        </section>
        <section id="about">
          <About />
        </section>
        <section id="skills">
          <Skills />
        </section>
        <section id="projects">
          <Projects />
        </section>
        <section id="experience">
          <Experience />
        </section>
        <section id="contact">
          <Contact />
        </section>
        <Footer />
      </div>
    </ParallaxProvider>
  );
}

export default App;