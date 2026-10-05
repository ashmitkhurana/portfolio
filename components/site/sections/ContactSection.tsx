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
      <div className="container">
        <DisplayHeading
          id="contact-title"
          size="xl"
          lines={contact.heading}
          depth={0}
        />

        <div className="contact__body">
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
