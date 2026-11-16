import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Map as GLMap } from "maplibre-gl";
import { ExploreRail } from "../components/explore/ExploreRail";
import { ExploreMap } from "../components/explore/ExploreMap";
import {
  locationFromHash,
  type ExploreLocation,
} from "../components/explore/location";
import { LogoMark } from "../components/Logo";
import { useI18n } from "../i18n";
import type { FieldBoundary } from "../../../src/shared/fields";
import "./explore.css";
// U2 owns this implementation; never duplicate the assistant here.
const Assistant = lazy(() =>
  import("../components/assistant/FieldAssistantPanel").then((m) => ({
    default: m.FieldAssistantPanel,
  })),
);
export function ExplorePage() {
  const { t } = useI18n();
  const [location, setLocation] = useState<ExploreLocation | null>(() =>
    locationFromHash(window.location.hash),
  );
  const [zip, setZip] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [rotating, setRotating] = useState(true),
    [layers, setLayers] = useState(false),
    [imagery, setImagery] = useState<"usgs" | "modis">("usgs");
  const [fields, setFields] = useState<FieldBoundary[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [showFields, setShowFields] = useState(true),
    [showBoundary, setShowBoundary] = useState(true);
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(
      null,
    ),
    [boundaryMissing, setBoundaryMissing] = useState(false),
    [fieldsUnavailable, setFieldsUnavailable] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true),
    [mapFailed, setMapFailed] = useState(false);
  const map = useRef<GLMap | null>(null),
    zipInput = useRef<HTMLInputElement>(null),
    lookup = useRef(0);
  useEffect(() => {
    const f = () => {
      const p = locationFromHash(window.location.hash);
      setLocation(p);
      setSelected([]);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (editing) zipInput.current?.focus();
  }, [editing]);
  useEffect(() => {
    setFields([]);
    setSelected([]);
    setBoundary(null);
    setBoundaryMissing(false);
    setFieldsUnavailable(false);
    if (!location) return;
    const c = new AbortController();
    const { lat, lon } = location;
    fetch(
      `/api/fields?bbox=${lon - 0.025},${lat - 0.025},${lon + 0.025},${lat + 0.025}`,
      { signal: c.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        setFields(d.fields);
        setFieldsUnavailable(!d.fields.length);
      })
      .catch(() => {
        if (!c.signal.aborted) setFieldsUnavailable(true);
      });
    if (location.zip)
      fetch(`/api/explore/boundary/${location.zip}`, { signal: c.signal })
        .then(async (r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((d) => {
          if (d.features?.length) setBoundary(d);
          else setBoundaryMissing(true);
        })
        .catch(() => {
          if (!c.signal.aborted) setBoundaryMissing(true);
        });
    return () => c.abort();
  }, [location]);
  function choose(p: ExploreLocation) {
    setLocation(p);
    setEditing(false);
    setRotating(false);
    setMessage("");
    setAssistantOpen(true);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{5}$/.test(zip)) {
      setMessage(t("Enter a five-digit US ZIP code."));
      zipInput.current?.focus();
      return;
    }
    const request = ++lookup.current;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/explore/zip/${zip}`);
      if (!r.ok) throw Error();
      const p = await r.json();
      if (request === lookup.current)
        choose({
          label: `${p.place}, ${p.state} · ${p.zip}`,
          lat: p.lat,
          lon: p.lon,
          zip: p.zip,
        });
    } catch {
      if (request === lookup.current)
        setMessage(t("ZIP lookup unavailable. Please try again."));
    } finally {
      if (request === lookup.current) setBusy(false);
    }
  }
  function locate() {
    ++lookup.current;
    setBusy(false);
    setMessage(t("Finding your location…"));
    if (!navigator.geolocation) {
      setMessage(t("Location unavailable. Enter a ZIP code instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        choose({
          label: t("Your location"),
          lat: p.coords.latitude,
          lon: p.coords.longitude,
        }),
      (e) =>
        setMessage(
          t(
            e.code === 1
              ? "Location permission denied. Enter a ZIP code instead."
              : "Location unavailable. Enter a ZIP code instead.",
          ),
        ),
      { timeout: 12000, maximumAge: 60000 },
    );
  }
  const zipForm = (
    <form onSubmit={submit} className="explore-zip-form">
      <label htmlFor="explore-zip">{t("US ZIP code")}</label>
      <div>
        <input
          ref={zipInput}
          id="explore-zip"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          pattern="[0-9]{5}"
          required
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="50010"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={t("Explore location")}
        >
          {busy ? "…" : "→"}
        </button>
      </div>
      <button className="explore-locate-text" type="button" onClick={locate}>
        {t("Use my location")} <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
  return (
    <main
      id="content"
      tabIndex={-1}
      className={`explore-page ${location ? "has-location" : "is-globe"} ${assistantOpen ? "assistant-open" : ""}`}
    >
      <ExploreRail onLayers={() => setLayers((v) => !v)} />
      <div className="explore-map-area">
        <ExploreMap
          location={location}
          imagery={imagery}
          fields={fields}
          selected={selected}
          showFields={showFields}
          boundary={boundary}
          showBoundary={showBoundary}
          rotating={rotating}
          onInteract={() => setRotating(false)}
          onSelect={(f) =>
            setSelected((v) =>
              v.includes(f.id) ? v.filter((id) => id !== f.id) : [...v, f.id],
            )
          }
          onReady={(m) => {
            map.current = m;
          }}
          onError={() => setMapFailed(true)}
          label={t(location ? "Satellite map" : "NASA globe")}
        />
        {!location && (
          <div className="explore-intro">
            <span>SOIL SENSE / {t("Explore")}</span>
            <h1>{t("Find your fields. See the bigger picture.")}</h1>
          </div>
        )}
        {(!location || editing) && (
          <section
            className="explore-location-card theme-canopy"
            aria-label={t("Change location")}
          >
            <div className="explore-card-brand">
              <LogoMark size={38} /> Soil Sense
            </div>
            <h2>{t("What's your ZIP code?")}</h2>
            <p>
              {t(
                "Satellite imagery and a field assistant, grounded in real data.",
              )}
            </p>
            {zipForm}
            {location && (
              <button type="button" onClick={() => setEditing(false)}>
                {t("Cancel")}
              </button>
            )}
          </section>
        )}
        {location && (
          <button
            className="explore-location-chip theme-canopy"
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
          >
            ⌖ {location.label} <span aria-hidden="true">⌄</span>
          </button>
        )}
        <div className="explore-map-controls theme-canopy">
          <button
            type="button"
            aria-label={t("Zoom in")}
            onClick={() => map.current?.zoomIn({ duration: 0 })}
          >
            +
          </button>
          <button
            type="button"
            aria-label={t("Zoom out")}
            onClick={() => map.current?.zoomOut({ duration: 0 })}
          >
            −
          </button>
          <button
            type="button"
            aria-label={t("Use my location")}
            onClick={locate}
          >
            ⌖
          </button>
          {!location && (
            <button
              type="button"
              aria-label={t(
                rotating ? "Stop globe rotation" : "Start globe rotation",
              )}
              aria-pressed={rotating}
              onClick={() => setRotating((v) => !v)}
            >
              {rotating ? "Ⅱ" : "▷"}
            </button>
          )}
        </div>
        {(message || mapFailed) && (
          <p role="status" className="explore-status">
            {message ||
              t(
                "Map unavailable. ZIP lookup and the field assistant still work.",
              )}
          </p>
        )}
        {location && (
          <div className="explore-map-notes">
            {boundaryMissing && (
              <p>
                {t("ZIP boundary unavailable; showing the location marker.")}
              </p>
            )}
          </div>
        )}
        <div className="explore-layers theme-canopy">
          <button
            type="button"
            aria-expanded={layers}
            aria-controls="explore-layer-menu"
            onClick={() => setLayers((v) => !v)}
          >
            ▱ {t("Layers")} {layers ? "⌄" : "⌃"}
          </button>
          {layers && (
            <section id="explore-layer-menu" aria-label={t("Layers")}>
              <label>
                <input
                  type="radio"
                  name="imagery"
                  checked={imagery === "usgs"}
                  onChange={() => setImagery("usgs")}
                />
                {t("USGS close-up")}
              </label>
              <label>
                <input
                  type="radio"
                  name="imagery"
                  checked={imagery === "modis"}
                  onChange={() => setImagery("modis")}
                />
                {t("NASA MODIS · July 29, 2025")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showFields}
                  onChange={(e) => setShowFields(e.target.checked)}
                />
                {t("USDA field outlines")}
              </label>
              {fieldsUnavailable && (
                <p>{t("Field outlines unavailable here.")}</p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={showBoundary}
                  onChange={(e) => setShowBoundary(e.target.checked)}
                />
                {t("ZIP outline")}
              </label>
              {fields.length > 0 && (
                <label>
                  {t("Select a field")}
                  <select
                    value={selected[0] ?? ""}
                    onChange={(e) =>
                      setSelected(e.target.value ? [e.target.value] : [])
                    }
                  >
                    <option value="">—</option>
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name || f.id} · {f.areaAcres.toFixed(1)} ac
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selected.length > 0 && (
                <p>
                  {t("Selected field")}: {selected.join(", ")}
                </p>
              )}
            </section>
          )}
        </div>
        {location && (
          <button
            type="button"
            className="explore-assistant-toggle theme-canopy"
            aria-expanded={assistantOpen}
            onClick={() => setAssistantOpen((v) => !v)}
          >
            {t(
              assistantOpen ? "Close field assistant" : "Open field assistant",
            )}
          </button>
        )}
      </div>
      {location && assistantOpen && (
        <aside className="explore-assistant theme-canopy">
          <Suspense fallback={<p>{t("Field assistant loading…")}</p>}>
            <Assistant
              context={{ ...location, selectedFieldIds: selected }}
              onClose={() => setAssistantOpen(false)}
            />
          </Suspense>
        </aside>
      )}
    </main>
  );
}
