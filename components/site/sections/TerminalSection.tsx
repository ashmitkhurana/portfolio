import Link from "next/link";
import { terminal } from "@/data/site-content";
import "./sections.css";
import "../terminal-placeholder.css";

const hrefs: Record<(typeof terminal.commands)[number], string> = {
  work: "/work",
  about: "/about",
  contact: "/#contact",
};

/**
 * Static, styled terminal window. The working terminal is a later phase; this
 * is the visual (and a real navigation list) the ribbon's tail curls around.
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
            <div className="terminal-window__bar">
              <span className="terminal-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="terminal-window__body">
              <p className="terminal-window__prompt">
                <span aria-hidden="true">&gt;</span>
                <span className="terminal-window__cmd">{terminal.prompt}</span>
                <span className="terminal-window__cursor" aria-hidden="true" />
              </p>
              <ul className="terminal-window__list">
                {terminal.commands.map((c) => (
                  <li key={c}>
                    <Link href={hrefs[c]}>{c}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="terminal__caption label">{terminal.caption}</p>
        </div>
      </div>
    </section>
  );
}
