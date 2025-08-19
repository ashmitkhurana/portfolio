import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { projects } from '../data/projects';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import Navbar from '../components/Navbar';
import CaseStudyHero from '../components/CaseStudyHero';
import ProcessTimeline from '../components/ProcessTimeline';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const CaseStudyPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const project = projects.find(p => p.slug === slug);
  const [counters, setCounters] = useState<number[]>([]);
  const metricsRef = useRef<HTMLDivElement>(null);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  // Initialize AOS
  useEffect(() => {
    AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: true,
    });
  }, []);

  // Initialize counters
  useEffect(() => {
    if (!project) return;
    
    setCounters(project.metrics.map(() => 0));
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          project.metrics.forEach((metric, index) => {
            const duration = 2000; // 2 seconds animation
            const steps = 60; // 60 steps (for smooth animation)
            const increment = metric.value / steps;
            let current = 0;
            let step = 0;
            
            const timer = setInterval(() => {
              current += increment;
              step++;
              
              if (step >= steps) {
                current = metric.value;
                clearInterval(timer);
              }
              
              setCounters(prev => {
                const newCounters = [...prev];
                newCounters[index] = Math.round(current);
                return newCounters;
              });
            }, duration / steps);
          });
          
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (metricsRef.current) {
      observer.observe(metricsRef.current);
    }
    
    return () => {
      observer.disconnect();
    };
  }, [project]);

  // Clean up chart on unmount
  useEffect(() => {
    // ChartJS instance will be managed by react-chartjs-2
    return () => {
      // No manual cleanup needed as react-chartjs-2 handles it
    };
  }, []);

  if (!project) {
    return (
      <div className="bg-[#0a0a0a]">
        <Navbar />
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
          <h1 className="text-4xl font-bold mb-6 text-white">Project Not Found</h1>
          <p className="text-xl text-gray-400 mb-8">The case study you're looking for doesn't exist.</p>
          <Link 
            to="/" 
            className="px-8 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Chart data (multi-axis by unit)
  const labels = project.metrics.map(m => m.label);
  const units = Array.from(new Set(project.metrics.map(m => m.unit)));

  // Colors for datasets
  const palette = [
    'rgba(53, 162, 235, 0.7)', // blue
    'rgba(168, 85, 247, 0.7)', // purple
    'rgba(236, 72, 153, 0.7)', // pink
    'rgba(16, 185, 129, 0.7)', // emerald
  ];

  const datasets = units.map((unit, i) => ({
    label: unit,
    data: project.metrics.map(m => (m.unit === unit ? m.value : null)),
    backgroundColor: palette[i % palette.length],
    borderColor: palette[i % palette.length].replace('0.7', '1'),
    borderWidth: 1,
    yAxisID: `y_${i}`,
    borderRadius: 8,
    categoryPercentage: 0.7,
    barPercentage: 0.7,
  }));

  const chartData = { labels, datasets } as const;

  type YScale = {
    type: 'linear';
    position: 'left' | 'right';
    ticks: { color: string };
    grid: { color?: string; drawOnChartArea?: boolean };
    title: { display: boolean; text: string; color: string };
    border?: { color?: string };
    beginAtZero: boolean;
  };

  const scales = units.reduce<Record<string, YScale>>((acc, unit, i) => {
    const isLeft = i % 2 === 0;
    const base = palette[i % palette.length];
    // derive opaque color for axis text/border
    const axisColor = base.includes('rgba') ? base.replace(/0\.7\)/, '1)') : base;
    const gridColor = base.includes('rgba') ? base.replace(/0\.7\)/, '0.18)') : 'rgba(255,255,255,0.08)';
    acc[`y_${i}`] = {
      type: 'linear',
      position: isLeft ? 'left' : 'right',
      ticks: { color: axisColor },
      grid: {
        color: isLeft ? gridColor : undefined,
        drawOnChartArea: isLeft,
      },
      title: { display: true, text: unit, color: axisColor },
      border: { color: axisColor },
      beginAtZero: true,
    } as const;
    return acc;
  }, {});

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: 'white' },
      },
      title: {
        display: true,
        text: 'Project Impact Metrics',
        color: 'white',
      },
      tooltip: {
        callbacks: {
          // @ts-expect-error - Chart.js typings are complex for tooltips
          label: function(tooltipItem) {
            const metric = project.metrics[tooltipItem.dataIndex];
            return `${metric.label}: ${tooltipItem.parsed.y} ${metric.unit}`;
          }
        }
      }
    },
    layout: { padding: 10 },
    scales: {
      x: {
        ticks: { color: 'white' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      },
      ...scales,
    }
  };

  // Get hero image and gallery images
  const heroImage = project.images[0];
  const galleryImages = project.images.slice(1);

  return (
    <div className="bg-[#0a0a0a] text-white">
      <Navbar />
      {/* Animated Case Study Hero */}
      <CaseStudyHero title={project.title} tagline={project.tagline} image={heroImage} />

      {/* Client & Problem */}
      <section className="py-16 bg-[#111]">
        <div className="max-w-4xl mx-auto px-4" data-aos="fade-in">
          <h2 className="text-3xl font-bold mb-8 text-center">About the Client</h2>
          <div className="bg-[#1a1a1a] p-8 rounded-xl">
            <h3 className="text-xl font-semibold mb-4 text-blue-400">{project.client}</h3>
            <p className="text-gray-300 leading-relaxed">{project.problem}</p>
          </div>
        </div>
      </section>

      {/* My Role & Tech Stack */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4" data-aos="slide-up">
          <h2 className="text-3xl font-bold mb-8 text-center">My Role</h2>
          <p className="text-gray-300 leading-relaxed mb-10 text-center text-xl">
            {project.role}
          </p>
          <h3 className="text-xl font-semibold mb-6 text-center">Technologies Used</h3>
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {project.tech.map((tech, index) => (
              <span 
                key={index}
                className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-full"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Process Timeline - Scroll Linked Animation */}
      <ProcessTimeline steps={project.process} />

      {/* Solution Gallery */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-12 text-center">Solution Gallery</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryImages.map((image, index) => (
              <div 
                key={index} 
                className="rounded-xl overflow-hidden" 
                data-aos="fade-up" 
                data-aos-delay={index * 100}
              >
                <div className="relative overflow-hidden group">
                  <img 
                    src={image.src} 
                    alt={image.alt} 
                    className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
                    <p className="text-white p-4 text-sm">{image.alt}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact & Metrics */}
      <section className="py-16 bg-[#111]" ref={metricsRef}>
        <div className="max-w-5xl mx-auto px-4" data-aos="fade-up">
          <h2 className="text-3xl font-bold mb-12 text-center">Impact</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {project.metrics.map((metric, index) => (
              <div key={index} className="bg-[#1a1a1a] p-6 rounded-xl text-center">
                <div className="text-4xl font-bold text-blue-400 mb-2">
                  {counters[index]}{metric.unit}
                </div>
                <div className="text-gray-300">{metric.label}</div>
              </div>
            ))}
          </div>
          
          <div className="bg-[#1a1a1a] p-6 rounded-xl">
            <div className="h-[420px]">
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4" data-aos="fade-in">
          <h2 className="text-3xl font-bold mb-12 text-center">Client Testimonial</h2>
          <blockquote className="bg-[#1a1a1a] p-8 rounded-xl border-l-4 border-blue-600">
            <p className="text-xl italic text-gray-300 mb-6">"{project.testimonial.quote}"</p>
            <footer className="text-right">
              <cite className="text-blue-400 font-semibold not-italic">— {project.testimonial.author}</cite>
            </footer>
          </blockquote>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 bg-[#111]">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">Like this project? Let's work together!</h2>
          <p className="text-gray-300 mb-10">I'm always looking for new and exciting projects to work on.</p>
          <Link 
            to="/contact" 
            className="inline-block px-8 py-4 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transform hover:scale-105 transition-all duration-300"
          >
            Get in Touch
          </Link>
        </div>
      </section>
    </div>
  );
};

export default CaseStudyPage;
