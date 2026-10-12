"use client";

import { useEffect, useRef, useState } from "react";
import manifest from "@/lib/ribbon/posters.json";

/**
 * Static ribbon posters: the two transparent layers of the ribbon (behind the
 * HTML / in front of the HTML) rendered through our own engine by
 * scripts/render-posters.mjs, so the weave still works with the HTML in between.
 * Used for T0 (inside <noscript>), T1 (no live rendering) and as the fallback
 * when the live engine fails or the GL context is lost. Data-driven: the list
 * lives in lib/ribbon/posters.json, files in public/ribbon/posters/.
 */
export type PosterLayer = "back" | "front";

interface PosterEntry {
  set: string;
  name: string;
  media: string | null;
}

function entriesFor(set: string): PosterEntry[] {
  const list = (manifest.posters as PosterEntry[]).filter((p) => p.set === set);
  // media-qualified sources must come before the unqualified default
  return [...list.sort((a, b) => Number(a.media === null) - Number(b.media === null))];
}

/** Server-safe: just the <picture> (AVIF > WebP, phone / desktop by media query). */
export function PosterPicture({
  layer,
  set = manifest.defaultSet,
  className = "",
}: {
  layer: PosterLayer;
  set?: string;
  className?: string;
}) {
  const entries = entriesFor(set);
  if (entries.length === 0) return null;
  const url = (e: PosterEntry, ext: string) => `${manifest.dir}/${e.name}-${layer}.${ext}`;
  const fallback = entries[entries.length - 1];
  return (
    <picture className={`ribbon-poster ${className}`.trim()} data-layer={layer}>
      {entries.flatMap((e) =>
        manifest.formats.map((ext) => (
          <source
            key={`${e.name}.${ext}`}
            media={e.media ?? undefined}
            srcSet={url(e, ext)}
            type={`image/${ext}`}
          />
        )),
      )}
      <img
        src={url(fallback, "webp")}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        tabIndex={-1}
      />
    </picture>
  );
}

/**
 * Client poster: fades in once the image has decoded (no pop, no empty frame).
 * `fade` false = already visible (used when crossfading over a live canvas the
 * parent fades out itself).
 */
export function RibbonPoster({ layer, set }: { layer: PosterLayer; set?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const img = ref.current?.querySelector("img");
    if (!img) return;
    let off = false;
    const show = () => {
      if (!off) requestAnimationFrame(() => !off && setShown(true));
    };
    if (img.complete && img.naturalWidth > 0) show();
    else {
      img.addEventListener("load", show, { once: true });
      // a failed image just stays invisible: the page background is already right
    }
    return () => {
      off = true;
      img.removeEventListener("load", show);
    };
  }, []);

  return (
    <div ref={ref} className={`ribbon-poster-wrap${shown ? " is-in" : ""}`}>
      <PosterPicture layer={layer} set={set} />
    </div>
  );
}
