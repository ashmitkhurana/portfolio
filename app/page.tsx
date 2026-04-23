import { isSafeMode } from "./lib/safeMode";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./components/About";
import Projects from "./components/Projects";
import Skills from "./components/Skills";
import Experience from "./components/Experience";
import Education from "./components/Education";
import Terminal from "./components/Terminal";
import Contact from "./components/Contact";

export default function HomePage() {
  const safe = typeof window !== "undefined" && isSafeMode();
  
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
}