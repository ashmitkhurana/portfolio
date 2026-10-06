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
          // the ribbon weaves BETWEEN the lines: ASHMIT sits behind the crossbar plane, KHURANA in front of it
          // (depths in cap heights: ASHMIT -0.25 H, KHURANA +0.25 H)
          depthCap={[-0.25, 0.25]}
          anchor="hero-name"
        />
        {/* the tagline always sits in front of the ribbon (very large proxy depth) */}
        <div className="hero__intro" data-ribbon-proxy="" data-ribbon-depth="5000" data-ribbon-pad="6">
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
