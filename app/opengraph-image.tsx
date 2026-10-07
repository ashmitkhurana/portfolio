import { ImageResponse } from "next/og";
import { identity } from "@/data/site-content";

export const alt = `${identity.name} — ${identity.role}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0d0c0b";
const FG = "#f2efe9";
const ACCENT = "#ff6a00";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BG,
          color: FG,
          fontFamily: "sans-serif",
        }}
      >
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <path
            d="M1200 150 C 1000 190, 820 330, 700 470 C 640 540, 580 600, 520 630 L 760 630 C 840 590, 920 520, 1000 440 C 1080 360, 1140 300, 1200 270 Z"
            fill={ACCENT}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 72,
            display: "flex",
            fontSize: 22,
            letterSpacing: 5,
            fontFamily: "monospace",
            color: FG,
          }}
        >
          FULL-STACK DEVELOPER
        </div>
        <div
          style={{
            position: "absolute",
            top: 150,
            left: 66,
            display: "flex",
            flexDirection: "column",
            fontSize: 190,
            fontWeight: 900,
            lineHeight: 0.92,
            letterSpacing: -6,
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
            fontSize: 30,
            color: FG,
          }}
        >
          {identity.tagline}
        </div>
      </div>
    ),
    { ...size },
  );
}
