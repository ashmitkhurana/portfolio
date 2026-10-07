/** Side-effect helpers for the terminal's fun commands. Browser only. */

/** Short synthesized explosion: a noise burst through a sweeping low-pass plus a sub thump. */
export function playBoom(): void {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const dur = 1.4;

    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(40, now + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(lp).connect(ng).connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(og).connect(ctx.destination);

    noise.start(now);
    osc.start(now);
    osc.stop(now + 1);
    window.setTimeout(() => void ctx.close().catch(() => {}), (dur + 0.2) * 1000);
  } catch {
    /* audio blocked or unsupported: the visual still runs */
  }
}

/** Screen shake + flash, then everything is restored. */
export function nukeEffect(): void {
  const root = document.documentElement;
  const flash = document.createElement("div");
  flash.className = "term-nuke-flash";
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);
  root.classList.add("term-nuke");
  playBoom();
  window.setTimeout(() => {
    root.classList.remove("term-nuke");
    flash.remove();
  }, 1100);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
