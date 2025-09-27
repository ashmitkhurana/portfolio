import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overHero, setOverHero] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Detect when the hero section is in view to make navbar opaque
  useEffect(() => {
    const hero = document.getElementById('home');
    if (!hero) return; // no hero on this route

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setOverHero(entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.2, // consider hero in view when ~20% visible
        rootMargin: '0px 0px -10% 0px',
      }
    );

    obs.observe(hero);
    return () => obs.disconnect();
  }, []);

  const navItems = [
    { name: 'About', href: '#about' },
    { name: 'Projects', href: '#projects' },
  { name: 'Skills', href: '#skills' },
    { name: 'Experience', href: '#experience' },
    { name: 'Education', href: '#education' },
    { name: 'Terminal', href: '#terminal' },
    { name: 'Contact', href: '#contact' },
  ];

  const scrollOrNavigate = async (href: string) => {
    const onHome = location.pathname === '/';
    if (!onHome) {
      // Navigate to home first
      navigate('/');
      // Give router a tick to render
      requestAnimationFrame(() => {
        const element = document.querySelector(href);
        if (element) element.scrollIntoView({ behavior: 'smooth' });
        window.history.replaceState(null, '', href);
      });
      setIsOpen(false);
      return;
    }

    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      window.history.replaceState(null, '', href);
    }
    setIsOpen(false);
  };

  const navClass = overHero
    ? 'bg-[#0a0a0a] border-white/10 shadow-[0_2px_24px_rgba(0,0,0,0.35)]'
    : scrolled
    ? 'bg-[#0a0a0a]/45 backdrop-blur-2xl border-white/10 shadow-[0_2px_24px_rgba(0,0,0,0.35)]'
    : 'bg-[#0a0a0a]/25 backdrop-blur-2xl border-transparent';

  const blurStyle = overHero
    ? undefined
    : { WebkitBackdropFilter: 'saturate(160%) blur(20px)', backdropFilter: 'saturate(160%) blur(20px)' } as React.CSSProperties;

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b isolate overflow-hidden ${navClass}`}
      style={blurStyle}
    >
      {/* Liquid glass sheen overlays */}
      <div className="absolute inset-0 pointer-events-none">
        {/* soft radial highlight */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-1/2 h-[200%] w-[140%] opacity-[0.06]"
          style={{
            background: 'radial-gradient(60% 30% at 50% 0%, rgba(255,255,255,0.8), rgba(255,255,255,0))'
          }}
        />
        {/* subtle top sheen line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-white/30 via-white/60 to-white/30 opacity-20" />
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <button
              onClick={() => (location.pathname === '/' ? scrollOrNavigate('#home') : navigate('/'))}
              className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity duration-200"
            >
              AK
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
        {navItems.map((item) => (
                <button
                  key={item.name}
          onClick={() => scrollOrNavigate(item.href)}
                  className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <motion.div
        initial={false}
        animate={isOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
        className={`md:hidden border-t border-white/10 ${
          overHero ? 'bg-[#0a0a0a]' : 'bg-[#0a0a0a]/60 backdrop-blur-2xl'
        }`}
      >
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
      {navItems.map((item) => (
            <button
              key={item.name}
        onClick={() => scrollOrNavigate(item.href)}
              className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium w-full text-left transition-colors duration-200"
            >
              {item.name}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.nav>
  );
};

export default Navbar;
