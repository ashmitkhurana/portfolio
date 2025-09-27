import { useState } from 'react';
import { Info, X } from 'lucide-react';

/**
 * MockDataBanner
 * A subtle, on-brand banner to communicate that case study data is placeholder.
 * - Non-intrusive: sits under Navbar, full-width container with max width.
 * - Accessible: role=region with aria-label and focusable close button.
 * - Dismissible: session-based dismissal (per tab) using sessionStorage.
 */
export default function MockDataBanner() {
  // Non-persistent dismissal: resets on reload
  const [hidden, setHidden] = useState<boolean>(false);

  if (hidden) return null;

  const onDismiss = () => {
    setHidden(true);
  };

  return (
    <div
      role="region"
      aria-label="Notice: case study data is mocked"
      className="w-full bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-pink-500/15 border-b border-white/10 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-5 flex items-start sm:items-center gap-3 sm:gap-4 text-base sm:text-lg text-gray-100">
        <span className="mt-0.5 sm:mt-0 inline-flex items-center justify-center text-blue-300">
          <Info className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="leading-relaxed">
          <span className="font-semibold text-white">Notice:</span> Case studies are in active development. Current figures, testimonials, and charts use mock data while client surveys and validations are underway. Final content will be published soon.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss mock data notice"
          className="ml-auto inline-flex shrink-0 h-9 w-9 items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
