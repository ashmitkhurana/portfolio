import Link from "next/link";
import { footer, nav, socials } from "@/data/site-content";
import "./footer.css";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__inner">
          <p className="label">{footer.legal}</p>
          <nav className="site-footer__nav" aria-label="Footer">
            <ul>
              {nav.map((item) => (
                <li key={item.href}>
                  <Link className="label" href={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
              {socials.map((s) => (
                <li key={s.href}>
                  <a
                    className="label"
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
