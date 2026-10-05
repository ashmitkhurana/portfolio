import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ArrowDown } from "@/components/site/icons";
import { hero, identity } from "@/data/site-content";
import "./sections.css";

export function HeroSection() {
  return (
    <section
      id="hero"
      data-section="hero"
      className="section hero"
      aria-labelledby="hero-title"
    >
      <div className="container hero__inner">
        <DisplayHeading
          as="h1"
          id="hero-title"
          size="hero"
          lines={identity.nameLines}
          depth={0}
          anchor="hero-name"
        />
        <div className="hero__intro">
          <p className="hero__role">{identity.role}</p>
          <p className="hero__tagline">{identity.tagline}</p>
        </div>
      </div>

      <div className="container hero__foot">
        <a className="hero__scroll label" href="#unravel">
          <span>{hero.scrollLabel}</span>
          <ArrowDown />
        </a>
        <span className="hero__domain label">{identity.domain}</span>
      </div>
    </section>
  );
}
