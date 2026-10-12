import { DisplayHeading } from "@/components/type/DisplayHeading";
import { CopyEmail } from "@/components/site/CopyEmail";
import { ArrowDown, ArrowUpRight } from "@/components/site/icons";
import { contact, resume, socials } from "@/data/site-content";
import "./sections.css";

export function ContactSection() {
  return (
    <section
      id="contact"
      data-section="contact"
      className="section contact"
      aria-labelledby="contact-title"
    >
      {/* a full-screen weave layer: the footer's fly-through passes in front of everything (journey.ts) */}
      <div className="contact__veil" data-ribbon-proxy="" data-ribbon-depth="5000" aria-hidden="true" />
      <div className="container">
        <DisplayHeading
          id="contact-title"
          size="xl"
          lines={contact.heading}
          // in front of the ribbon everywhere (desktop as before); phone: like the hero name, the A's apex rises over a
          // couple of letters of SOMETHING and sits in front of them
          ribbonFront={[[], []]}
          ribbonFrontPortrait={[[], [2, 3]]}
        />

        {/* (in front of the ribbon, like the hero's tagline) */}
        <div className="contact__body" data-ribbon-proxy="" data-ribbon-depth="5000" data-ribbon-pad="6">
          <p className="contact__copy">{contact.copy}</p>
          <CopyEmail />
          <ul className="contact__links">
            {socials.map((s) => (
              <li key={s.href}>
                <a
                  className="label link-arrow"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.label}
                  <ArrowUpRight />
                </a>
              </li>
            ))}
            <li>
              <a className="label link-arrow" href={resume.href} download>
                Resume
                <ArrowDown />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
