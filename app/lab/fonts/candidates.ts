/**
 * Display-face candidates for the giant hero name (lab only).
 * next/font loaders must be called with literal options at module scope.
 * Inter is the site's current face and comes from the root layout (--font-sans).
 */
import {
  Archivo,
  Bricolage_Grotesque,
  Geist,
  Hanken_Grotesk,
  Hubot_Sans,
  Inter_Tight,
  Libre_Franklin,
  Mona_Sans,
  Public_Sans,
  Roboto_Flex,
  Schibsted_Grotesk,
} from "next/font/google";

const interTight = Inter_Tight({ subsets: ["latin"], weight: "variable", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: "variable", axes: ["wdth"], display: "swap" });
const geist = Geist({ subsets: ["latin"], weight: "variable", display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: "variable", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], weight: "variable", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: "variable", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "wdth"],
  display: "swap",
});
const monaSans = Mona_Sans({ subsets: ["latin"], weight: "variable", axes: ["wdth"], display: "swap" });
const hubotSans = Hubot_Sans({ subsets: ["latin"], weight: "variable", axes: ["wdth"], display: "swap" });
const libreFranklin = Libre_Franklin({ subsets: ["latin"], weight: "variable", display: "swap" });
const robotoFlex = Roboto_Flex({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz", "wdth"],
  display: "swap",
});

export interface FontCandidate {
  id: string;
  name: string;
  family: string;
  weight: number;
  /** [min, max, default] of the wdth axis (percent), or null when the font has none */
  wdth: [number, number, number] | null;
  note: string;
}

export const CANDIDATES: FontCandidate[] = [
  {
    id: "inter",
    name: "Inter",
    family: "var(--font-sans), system-ui, sans-serif",
    weight: 900,
    wdth: null,
    note: "Current. Auto optical size (Inter Display cut at this size).",
  },
  { id: "inter-tight", name: "Inter Tight", family: interTight.style.fontFamily, weight: 900, wdth: null, note: "Inter with tighter spacing built in." },
  { id: "archivo", name: "Archivo", family: archivo.style.fontFamily, weight: 900, wdth: [62, 125, 100], note: "Grotesque with a wide wdth range." },
  { id: "geist", name: "Geist", family: geist.style.fontFamily, weight: 900, wdth: null, note: "Swiss-minded, geometric lean." },
  { id: "schibsted", name: "Schibsted Grotesk", family: schibsted.style.fontFamily, weight: 900, wdth: null, note: "Editorial grotesk." },
  { id: "public-sans", name: "Public Sans", family: publicSans.style.fontFamily, weight: 900, wdth: null, note: "Neutral, Libre Franklin descendant." },
  { id: "hanken", name: "Hanken Grotesk", family: hanken.style.fontFamily, weight: 900, wdth: null, note: "Clean neo-grotesk." },
  { id: "bricolage", name: "Bricolage Grotesque", family: bricolage.style.fontFamily, weight: 800, wdth: [75, 100, 100], note: "Quirky; max weight 800, wdth 75-100, opsz auto." },
  { id: "mona", name: "Mona Sans", family: monaSans.style.fontFamily, weight: 900, wdth: [75, 125, 100], note: "Helvetica-ish grotesque with a real wdth axis." },
  { id: "hubot", name: "Hubot Sans", family: hubotSans.style.fontFamily, weight: 900, wdth: [75, 125, 100], note: "Mona's more technical sibling, wdth axis." },
  { id: "franklin", name: "Libre Franklin", family: libreFranklin.style.fontFamily, weight: 900, wdth: null, note: "Franklin Gothic revival, heavy and compact." },
  { id: "roboto-flex", name: "Roboto Flex", family: robotoFlex.style.fontFamily, weight: 900, wdth: [25, 151, 100], note: "Huge wdth range (25-151), opsz auto." },
];
