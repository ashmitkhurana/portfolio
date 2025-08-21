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
import { isSafeMode } from './lib/safeMode';

// HomePage component to encapsulate the main page layout
const HomePage = () => {
  const safe = typeof window !== 'undefined' && isSafeMode();
  return (
    <>
      <Navbar />
      {safe ? (
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-xl px-6">
            <h1 className="text-3xl font-bold mb-4">Safe mode</h1>
            <p className="text-gray-300">Rendering minimal content to diagnose a performance issue. Remove <span className="font-mono">?safe=1</span> from the URL for the full site.</p>
          </div>
        </main>
      ) : (
        <>
          <section id="home">
            <Hero />
          </section>
          <About />
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
      )}
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
          {/* Fallback to HomePage for any unknown path (handles "/#about" etc.) */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;