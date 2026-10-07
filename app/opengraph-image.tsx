import { ImageResponse } from "next/og";
import { identity } from "@/data/site-content";

export const alt = `${identity.name} — ${identity.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0d0c0b";
const FG_MUTED = "rgba(244, 239, 231, 0.7)";
const ACCENT = "#ff6a00";
const ACCENT_DARK = "#b84a00";

const NAME_SIZE = 148;

async function loadGoogleFont(family: string, weight: number, text?: string) {
  const params = `family=${family}:wght@${weight}${text ? `&text=${encodeURIComponent(text)}` : ""}&display=swap`;
  const css = await (await fetch(`https://fonts.googleapis.com/css2?${params}`)).text();
  const match = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!match) throw new Error(`No font src for ${family} ${weight}`);
  const res = await fetch(match[1]);
  if (!res.ok) throw new Error(`Font fetch failed for ${family}`);
  const data = await res.arrayBuffer();
  console.log(`[og] font ${family} ${weight}: ${data.byteLength} bytes`);
  return data;
}

type OgFont = { name: string; data: ArrayBuffer; weight: 500 | 900; style: "normal" };

async function loadFonts(): Promise<OgFont[] | null> {
  try {
    const [mona900, mona500, mono] = await Promise.all([
      loadGoogleFont("Mona+Sans", 900, "ASHMITKHURANA"),
      loadGoogleFont("Mona+Sans", 500, identity.tagline),
      loadGoogleFont("JetBrains+Mono", 500, "FULL-STACK DEVELOPER"),
    ]);
    return [
      { name: "Mona Sans", data: mona900, weight: 900, style: "normal" },
      { name: "Mona Sans", data: mona500, weight: 500, style: "normal" },
      { name: "JetBrains Mono", data: mono, weight: 500, style: "normal" },
    ];
  } catch (err) {
    console.log("[og] font load failed, using defaults:", err);
    return null;
  }
}

export default async function OpengraphImage() {
  const fonts = await loadFonts();
  const display = fonts ? "Mona Sans" : "sans-serif";
  const mono = fonts ? "JetBrains Mono" : "monospace";
  const ribbon =
    "M 1120 700 C 1120 520, 760 540, 760 380 C 760 220, 1060 240, 1060 -40";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BG,
          fontFamily: display,
        }}
      >
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <path d={ribbon} fill="none" stroke={ACCENT_DARK} strokeWidth="120" />
          <path
            d={ribbon}
            fill="none"
            stroke={ACCENT}
            strokeWidth="106"
            transform="translate(-7 -7)"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 72,
            display: "flex",
            fontFamily: mono,
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "0.12em",
            color: FG_MUTED,
          }}
        >
          FULL-STACK DEVELOPER
        </div>
        <div
          style={{
            position: "absolute",
            top: 160,
            left: 66,
            display: "flex",
            flexDirection: "column",
            fontFamily: display,
            fontSize: NAME_SIZE,
            fontWeight: 900,
            lineHeight: 0.82,
            letterSpacing: "-0.04em",
            color: "#f4efe7",
          }}
        >
          <div style={{ display: "flex" }}>ASHMIT</div>
          <div style={{ display: "flex" }}>KHURANA</div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 64,
            left: 72,
            display: "flex",
            fontFamily: display,
            fontWeight: 500,
            fontSize: 30,
            color: FG_MUTED,
          }}
        >
          {identity.tagline}
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) },
  );
}
