/**
 * Pinned (CSS sticky) blocks: `[data-pin]` elements stay put on screen while the page scrolls through their
 * section's scroll room. Anything measured inside one is described at the pin's REST position (the pin at the
 * top of its section), and its live screen position follows the pin, not window.scrollY.
 */

/** the pin an element lives in (null = scrolls with the page) */
export function pinOf(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>("[data-pin]");
}

/**
 * Add this to a viewport rect's top to get the element's page Y at rest: for a pinned element, its offset inside
 * the pin + the pin's section top in page coordinates; otherwise plain window.scrollY.
 */
export function restOffsetY(el: Element): number {
  const pin = pinOf(el);
  if (!pin) return window.scrollY;
  const section = pin.parentElement ?? pin;
  return section.getBoundingClientRect().top + window.scrollY - pin.getBoundingClientRect().top;
}
