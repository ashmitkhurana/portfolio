import { terminal } from "@/data/site-content";
import { Terminal } from "@/components/terminal/Terminal";
import "./sections.css";

/**
 * Section 05: the working terminal, inline. The window container keeps the
 * ribbon proxy attributes the ribbon's tail curls around.
 */
export function TerminalSection() {
  return (
    <section
      id="terminal"
      data-section="terminal"
      className="section terminal"
      aria-label="Explore"
    >
      <div className="container terminal__inner">
        <div className="terminal__space" aria-hidden="true" />

        <div className="terminal__col">
          <div
            className="terminal-window"
            data-ribbon-proxy=""
            data-ribbon-depth={0}
            data-ribbon-radius={16}
          >
            <Terminal variant="inline" />
          </div>
          <p className="terminal__caption label">{terminal.caption}</p>
        </div>
      </div>
    </section>
  );
}
