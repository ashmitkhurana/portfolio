import Link from "next/link";
import { projects } from "@/data/projects";

// Placeholder gradient if no cover image
const getGradient = (index: number) => {
  const gradients = [
    "from-indigo-600 to-purple-600",
    "from-blue-600 to-cyan-600",
    "from-emerald-600 to-teal-600",
    "from-orange-600 to-red-600",
    "from-fuchsia-600 to-pink-600",
    "from-violet-600 to-indigo-600",
  ];
  return gradients[index % gradients.length];
};

export default function WorkPage() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24">
      <div className="section-container">
        {/* Header */}
        <div className="mb-16 md:mb-24">
          <h1 className="font-display font-bold text-5xl md:text-7xl text-white mb-6">
            All Work
          </h1>
          <p className="text-white/50 text-lg md:text-xl max-w-2xl font-mono">
            A comprehensive archive of selected projects, case studies, and engineering challenges.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pt-16">
          {projects.map((project, i) => (
            <Link
              key={project.slug}
              href={`/work/${project.slug}`}
              className="group flex flex-col border border-white/10 bg-[#0d0d0d] rounded-2xl overflow-hidden hover:border-white/30 hover:bg-[#111] transition-all duration-300 h-full"
            >
              {/* Image / Cover */}
              <div className="relative aspect-[16/10] overflow-hidden bg-black/50 border-b border-white/5">
                {project.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.cover}
                    alt={project.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-br ${getGradient(
                      i
                    )} opacity-40 transition-transform duration-700 group-hover:scale-105`}
                  />
                )}
                {/* Subtle overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] to-transparent opacity-60" />
              </div>

              {/* Content */}
              <div className="flex flex-col flex-1 p-6 md:p-8">
                <h2 className="font-display font-bold text-2xl text-white mb-3 group-hover:text-blue-400 transition-colors">
                  {project.title.split("—")[0].trim()}
                </h2>
                <p className="text-white/50 text-sm leading-relaxed mb-8 line-clamp-3">
                  {project.tagline}
                </p>

                {/* Stack gap spacer pushes this section to the bottom */}
                <div className="mt-auto flex flex-col gap-6">
                  <div className="flex flex-wrap gap-2">
                    {project.stack.slice(0, 5).map((tech) => (
                      <span
                        key={tech}
                        className="px-3 py-1.5 rounded-md bg-[#1a1f35] text-blue-300 text-xs font-mono font-medium border border-blue-900/30"
                      >
                        {tech}
                      </span>
                    ))}
                    {project.stack.length > 5 && (
                      <span className="px-3 py-1.5 rounded-md bg-white/5 text-white/40 text-xs font-mono font-medium border border-white/5">
                        +{project.stack.length - 5}
                      </span>
                    )}
                  </div>

                  {/* Footer link row */}
                  <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="text-white/30 group-hover:text-white transition-colors"
                    >
                      <path
                        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-blue-400 group-hover:text-blue-300 transition-colors">
                      View Case Study →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}