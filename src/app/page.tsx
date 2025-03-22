import Hero from '../components/Hero';
import About from '../components/About';
import Skills from '../components/Skills';
import Experience from '../components/Experience';
import Contact from '../components/Contact';

export default function Home() {
  return (
    <main className="min-h-screen bg-dark text-white">
      <Hero />
      <About />
      <Skills />
      <Experience />
      <Contact />
    </main>
  );
} 