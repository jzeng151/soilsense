// "How this plan builds your soil" and "What the satellite measures mean": the plain-language explanations the
// Field Shift challenge asks for (nitrogen-fixing, cover, deep-rooting and drought-tolerant crops; NDVI,
// evapotranspiration, soil moisture, frost risk, water balance).

import { Definition } from "./Glossary";
import { glossaryEntry } from "../../../src/shared/glossary";
import type { CoverId, CropId, RotationPlan } from "../../../src/shared/types";
import { CROP_COLORS } from "./PlanCard";
import "../evidence.css";

type Kind = "nitrogen" | "roots" | "drought" | "cover" | "pests" | "residue" | "bare";

const KIND_LABEL: Record<Kind, { icon: string; title: string }> = {
  nitrogen: { icon: "🌱", title: "Adds nitrogen" },
  roots: { icon: "🌾", title: "Deep roots" },
  drought: { icon: "☀️", title: "Handles drought" },
  cover: { icon: "🛡️", title: "Keeps the ground covered" },
  pests: { icon: "🔄", title: "Review rotation effects" },
  residue: { icon: "🍂", title: "Leaves residue" },
  bare: { icon: "⚠️", title: "Watch out" },
};

/** What each crop does for the soil (agronomy basics, kept short). */
const CROP_SOIL: Record<CropId, { kind: Kind; text: string }[]> = {
  soybean: [{ kind: "nitrogen", text: "Soybean is a legume: bacteria on its roots pull nitrogen from the air, so it needs no nitrogen fertilizer and leaves some for the next crop." }],
  alfalfa: [
    { kind: "nitrogen", text: "Alfalfa is a legume that fixes a lot of nitrogen; corn after alfalfa usually needs little or no added nitrogen." },
    { kind: "roots", text: "Its roots reach 6 feet or more, opening hard subsoil so water soaks in deeper." },
    { kind: "cover", text: "As a crop that stays for several years, it covers the ground all year and builds organic matter." },
  ],
  sorghum: [
    { kind: "drought", text: "Grain sorghum tolerates drought and heat better than corn: it can pause in dry spells and recover when rain comes." },
    { kind: "roots", text: "Its deep, dense roots reach water and stored nitrogen far down the soil profile." },
  ],
  winter_wheat: [
    { kind: "cover", text: "Winter wheat is sown in fall, so the ground is covered through winter and spring, when wind and water erosion are worst." },
    { kind: "drought", text: "It grows in the cooler, wetter part of the year and is harvested before the summer heat." },
    { kind: "pests", text: "A small-grain phase is not universal pest or disease protection. Review the plan’s named-pest notes, local field history and volunteer corn with your agronomist." },
  ],
  oats: [{ kind: "pests", text: "An oats phase is not universal pest or disease protection. Review named-pest evidence and confirm whether the following cover-crop planting window is feasible locally." }],
  corn: [{ kind: "residue", text: "Corn leaves a lot of stalks and leaves on the field, which protect the surface and feed soil organic matter, but it needs the most nitrogen fertilizer." }],
  fallow: [{ kind: "bare", text: "A fallow season stores water for the next crop, but bare ground can blow or wash away and loses organic matter. Leaving crop residue standing helps." }],
};

const COVER_SOIL: Record<Exclude<CoverId, "none">, { kind: Kind; text: string }> = {
  cereal_rye: { kind: "cover", text: "A cereal rye cover crop holds the soil over winter and soaks up nitrogen left in the ground so it doesn't wash away." },
  crimson_clover: { kind: "nitrogen", text: "A crimson clover cover crop is a legume: it covers the soil over winter and adds nitrogen for the next crop." },
  hairy_vetch: { kind: "nitrogen", text: "A hairy vetch cover crop is a legume that adds a lot of nitrogen, enough to cut fertilizer for the following corn." },
};

/** "How this plan builds your soil": only the points that apply to this plan's crops and cover crops. */
export function SoilBuild({ plan }: { plan: RotationPlan }) {
  const seen = new Set<string>();
  const items: { key: string; kind: Kind; text: string; crop?: CropId }[] = [];
  for (const y of plan.years) {
    for (const it of CROP_SOIL[y.crop]) {
      const key = `${y.crop}:${it.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, kind: it.kind, text: it.text, crop: y.crop });
    }
    if (y.cover !== "none") {
      const c = COVER_SOIL[y.cover];
      if (!seen.has(`cover:${y.cover}`)) {
        seen.add(`cover:${y.cover}`);
        items.push({ key: `cover:${y.cover}`, kind: c.kind, text: c.text });
      }
    }
  }
  const crops = new Set(plan.years.map((y) => y.crop).filter((c) => c !== "fallow"));
  if (crops.size >= 2) items.push({ key: "variety", kind: "pests", text: `This plan has ${crops.size} different crops in 3 years. Pest effects depend on the pest, crop sequence, region and field history; diversity alone is not a promise of protection.` });
  // Good things first, cautions last.
  items.sort((a, b) => Number(a.kind === "bare") - Number(b.kind === "bare"));
  return (
    <div className="sb-build">
      <p className="wi-lead">Plain-language soil science behind this plan:</p>
      <ul>
        {items.map((it) => (
          <li key={it.key} className={it.kind === "bare" ? "warn" : ""}>
            <span className="sb-icon" aria-hidden="true">
              {KIND_LABEL[it.kind].icon}
            </span>
            <span>
              <b>{KIND_LABEL[it.kind].title}.</b> {it.text}
            </span>
            {it.crop && <span className="sb-cropdot" style={{ background: CROP_COLORS[it.crop] }} aria-hidden="true" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "What the satellite measures mean": the indicators named in the challenge, in plain words. */
export function IndicatorGuide() {
  const rows = [
    { id: "ndvi", where: "NASA MODIS greenness map layer; availability and quality must be checked separately" },
    { id: "et", where: "Modeled demand from daily temperature; OpenET actual-ET estimates where available" },
    { id: "root-zone-moisture", where: "NASA POWER root-zone wetness; NASA SMAP map layer" },
    { id: "water-balance", where: "Rain minus modeled demand, May–September" },
    { id: "frost-risk", where: "NASA daily minimum temperatures" },
    { id: "gdd", where: "Accumulated warmth from daily NASA temperature" },
    { id: "rainfall-anomaly", where: "Compare matching calendar windows and the stated baseline" },
  ];
  return (
    <dl className="ig-list">
      {rows.map((r) => (
        <div key={r.id}>
          <dt><Definition term={r.id} /></dt>
          <dd>
            {glossaryEntry(r.id).definition} {glossaryEntry(r.id).limit}
            <small>{r.where}</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}
