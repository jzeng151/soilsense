interface Source {
  name: string;
  org: string;
  url: string;
  what: string;
  data: string[];
  usedFor: string;
  status?: "optional" | "map" | "ai";
}

interface Group {
  title: string;
  intro: string;
  sources: Source[];
}

const GROUPS: Group[] = [
  {
    title: "Field data",
    intro: "We look these up live for the exact spot you pick, then cache the results so repeat visits are fast.",
    sources: [
      {
        name: "NASA POWER",
        org: "NASA Langley Research Center",
        url: "https://power.larc.nasa.gov/",
        what: "Daily weather for any point on Earth, built from NASA satellite and weather-model data (MERRA-2). It covers 1991 to last year.",
        data: ["Daily rainfall", "Daily average, high and low temperature", "Root-zone soil wetness"],
        usedFor:
          "This is the core of every plan. From it we work out frost-free days, growing degree days, hot days of 95 °F or more, spring rain, summer dry spells and summer highs. Then we test which of those are really changing on your field.",
      },
      {
        name: "Daymet",
        org: "NASA Oak Ridge National Laboratory DAAC",
        url: "https://daymet.ornl.gov/",
        what: "Daily weather for North America on a fine 1-kilometer grid, built from weather stations. It covers 1991 to last year.",
        data: ["Daily rainfall", "Daily high and low temperature"],
        usedFor:
          "We average it with NASA POWER for every weather calculation. Two independent NASA datasets agree better with real harvests than either one alone.",
      },
      {
        name: "SSURGO soil survey",
        org: "USDA Natural Resources Conservation Service",
        url: "https://sdmdataaccess.sc.egov.usda.gov/",
        what: "The official US soil map. It is drawn field by field from on-the-ground soil surveys.",
        data: ["Soil name and type", "Drainage class", "pH", "Organic matter", "Clay and sand content", "Water-holding capacity"],
        usedFor: "This shows how much water your soil can store for dry spells, and which crops suit your soil.",
      },
      {
        name: "Cropland Data Layer (CropScape)",
        org: "USDA National Agricultural Statistics Service",
        url: "https://nassgeodata.gmu.edu/CropScape/",
        what: "A satellite map of what was planted on every 30-meter square of US farmland, made every year.",
        data: ["What crop grew on your field in each of the last 6 years"],
        usedFor: "It shows your recent rotation, so the plan follows on from what you actually grew and avoids repeating crops.",
      },
      {
        name: "FCC Area API",
        org: "Federal Communications Commission",
        url: "https://geo.fcc.gov/api/census/",
        what: "Turns a map point into a US county.",
        data: ["County name", "State", "County code (FIPS)"],
        usedFor: "We use it to label your field and match it to county-level farm statistics.",
      },
      {
        name: "Quick Stats",
        org: "USDA National Agricultural Statistics Service",
        url: "https://quickstats.nass.usda.gov/",
        what: "Official USDA farm survey results.",
        data: ["County yields, split into irrigated and rain-fed", "Crop prices farmers received over the last 12 months"],
        usedFor:
          "Sets realistic yields for how your field is farmed, uses current prices for the profit estimates, and provides the real harvests we check our model against.",
      },
      {
        name: "Cause of Loss records",
        org: "USDA Risk Management Agency",
        url: "https://www.rma.usda.gov/tools-reports/summary-of-business/cause-loss",
        what: "Crop insurance payouts in each county, by crop, year and cause.",
        data: ["What hurt each crop in each year: drought, flood, hail, wind, freeze or pests"],
        usedFor:
          "Labels the worst harvest years with their real cause, explains years our weather model misses (like the 2020 Iowa windstorm), and adds a \"what hurts this crop here\" reason.",
      },
      {
        name: "OpenET",
        org: "OpenET (NASA, USGS, Google and partners), from Landsat satellites",
        url: "https://etdata.org/",
        what: "How much water each field actually used each month, measured from satellites since 2016.",
        data: ["Monthly water use (evapotranspiration) on your field"],
        usedFor: "An independent check of our water model, and a hint when a field marked rain-fed is probably irrigated.",
      },
      {
        name: "Zippopotam.us",
        org: "Open ZIP code database",
        url: "https://www.zippopotam.us/",
        what: "Turns a US ZIP code into a location.",
        data: ["Town", "State", "Latitude and longitude"],
        usedFor: "Used by the phone line and by Scout, so you can say a ZIP code instead of clicking a map.",
      },
    ],
  },
  {
    title: "Maps",
    intro: "Map pictures only. These help you find your field and are not used to build the plan.",
    sources: [
      {
        name: "NASA GIBS (MODIS Terra)",
        org: "NASA Earth Science Data Systems",
        url: "https://gibs.earthdata.nasa.gov/",
        what: "True-color satellite pictures of the whole country from NASA's Terra satellite.",
        data: ["Satellite picture from a clear midsummer day"],
        usedFor: "The map you see when it is zoomed out.",
        status: "map",
      },
      {
        name: "USGS National Map imagery",
        org: "US Geological Survey",
        url: "https://www.usgs.gov/programs/national-geospatial-program/national-map",
        what: "Detailed aerial photos.",
        data: ["Close-up aerial photo"],
        usedFor: "The map when you zoom in, so you can see the edges of your field.",
        status: "map",
      },
      {
        name: "OpenStreetMap",
        org: "OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/",
        what: "A free street map of the world.",
        data: ["Roads", "Towns", "Place names"],
        usedFor: "The \"Street map\" option in the map's layer menu.",
        status: "map",
      },
    ],
  },
  {
    title: "AI helpers",
    intro: "These only answer your questions. They never change the numbers in your plan.",
    sources: [
      {
        name: "Workers AI (Llama 3.3)",
        org: "Cloudflare",
        url: "https://developers.cloudflare.com/workers-ai/",
        what: "An AI model that runs on Cloudflare.",
        data: ["Written answers"],
        usedFor: "Powers Scout, the chat assistant, and answers the \"Have a question?\" box. Every call goes through Cloudflare AI Gateway (logs, caching, limits).",
        status: "ai",
      },
      {
        name: "Gemini",
        org: "Google",
        url: "https://ai.google.dev/",
        what: "An AI model from Google.",
        data: ["Chat answers"],
        usedFor: "Backup for Scout if Workers AI is unavailable, and the phone voice agent. Uses the same field data and plan engine as the planner.",
        status: "ai",
      },
    ],
  },
];

const BADGE: Record<NonNullable<Source["status"]>, string> = {
  optional: "Off right now (needs a free USDA key)",
  map: "Map picture only",
  ai: "Answers questions",
};

export function SourcesPage({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="app sources">
      <button type="button" className="sb-toggle" aria-label="Open sidebar" onClick={onMenu}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <main className="src-wrap">
        <header className="src-head">
          <p className="eyebrow">Data sources</p>
          <h1>Where our data comes from</h1>
          <p className="intro-lead">Every plan is built from free, public data from NASA and the US government. Here is each source, what we take from it, and what it does in your plan.</p>
        </header>

        {GROUPS.map((g) => (
          <section key={g.title} className="src-group">
            <h2>{g.title}</h2>
            <p className="hint">{g.intro}</p>
            <div className="src-grid">
              {g.sources.map((s) => (
                <article key={s.name} className="src-card">
                  <div className="src-card-head">
                    <div>
                      <h3>{s.name}</h3>
                      <p className="src-org">{s.org}</p>
                    </div>
                    {s.status && <span className={`src-badge src-badge-${s.status}`}>{BADGE[s.status]}</span>}
                  </div>
                  <p>{s.what}</p>
                  <h4>Data we get</h4>
                  <div className="chips">
                    {s.data.map((d) => (
                      <span key={d} className="chip src-chip">
                        {d}
                      </span>
                    ))}
                  </div>
                  <h4>What it does</h4>
                  <p>{s.usedFor}</p>
                  <a href={s.url} target="_blank" rel="noreferrer" className="src-link">
                    Visit source ↗
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
