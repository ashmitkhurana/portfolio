import Link from "next/link";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ArrowRight } from "@/components/site/icons";
import "./pages.css";

export function NotFoundContent() {
  return (
    <section className="section not-found" data-section="not-found">
      <div className="container not-found__inner">
        <p className="label">Page not found</p>
        <DisplayHeading as="h1" size="xl" lines={["404"]} depth={0} />
        <p className="not-found__copy">
          This page took a different turn. Head back to where the ribbon starts.
        </p>
        <Link className="label link-arrow" href="/">
          Back to home
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
