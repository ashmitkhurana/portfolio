import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import About from './components/About';
import Skills from './components/Skills';
import Projects from './components/Projects';
import Experience from './components/Experience';
import Education from './components/Education';
import Contact from './components/Contact';
import Terminal from './components/Terminal';
import CaseStudyPage from './pages/CaseStudyPage';
import ScrollToTop from './components/ScrollToTop';

// HomePage component to encapsulate the main page layout
const HomePage = () => {
  return (
    <>
      <Navbar />
      <section id="home">
        <Hero />
      </section>
      <section id="about">
        <About />
      </section>
      <section id="projects">
        <Projects />
      </section>
      <section id="skills">
        <Skills />
      </section>
      <section id="experience">
        <Experience />
      </section>
      <section id="education">
        <Education />
      </section>
      <section id="terminal">
        <Terminal />
      </section>
      <section id="contact">
        <Contact />
      </section>
    </>
  );
};

function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="bg-[#0a0a0a] text-white">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects/:slug" element={<CaseStudyPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;