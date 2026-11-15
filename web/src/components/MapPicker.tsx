import { useI18n } from "../i18n";
import L from "leaflet";
import { useEffect, useRef } from "react";

export interface DemoFarm {
  name: string;
  lat: number;
  lon: number;
  note: string;
  irrigated: boolean;
}

// Points checked against USGS imagery and SSURGO: each sits inside a working field.
export const DEMO_FARMS: DemoFarm[] = [
  { name: "Story County, Iowa", lat: 42.0563, lon: -93.495, note: "Clarion loam · Corn Belt, rain-fed", irrigated: false },
  { name: "Champaign County, Illinois", lat: 40.048, lon: -88.33, note: "Elburn silt loam · rain-fed", irrigated: false },
  { name: "Finney County, Kansas", lat: 38.1095, lon: -100.706, note: "Center-pivot field · High Plains, irrigated", irrigated: true },
  { name: "Lancaster County, Nebraska", lat: 40.73, lon: -96.55, note: "Nodaway silt loam · rain-fed", irrigated: false },
];

// NASA GIBS: MODIS Terra true-color composite for a cloud-light midsummer day.
const GIBS_DATE = "2025-07-29";
const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
const GIBS_URL = `${GIBS_BASE}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

interface Props {
  point: { lat: number; lon: number } | null;
  onPick: (lat: number, lon: number) => void;
  /** Move the map here (e.g. after a ZIP search) without choosing a field. */
  focus?: { lat: number; lon: number; zoom: number; key: number } | null;
}

export function MapPicker({ point, onPick, focus }: Props) {
  const { t, language } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: [40.5, -95.5], zoom: 5, minZoom: 4, worldCopyJump: false });
    const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    // USGS National Map orthoimagery (public domain) for zooming in to an individual field.
    const imagery = L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18,
      maxNativeZoom: 16,
      attribution: "Imagery: USGS The National Map",
    });
    const nasa = L.tileLayer(GIBS_URL, {
      maxZoom: 18,
      maxNativeZoom: 9,
      attribution: `NASA GIBS · MODIS Terra true color, ${GIBS_DATE}`,
    });
    nasa.addTo(m);
    // NASA overlays (GIBS): how green the plants are, and how wet the root zone is, on the same date.
    const ndvi = L.tileLayer(`${GIBS_BASE}/MODIS_Terra_NDVI_8Day/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`, {
      maxZoom: 18,
      maxNativeZoom: 9,
      opacity: 0.75,
      attribution: "NASA MODIS Terra NDVI (8-day)",
    });
    const smap = L.tileLayer(`${GIBS_BASE}/SMAP_L4_Analyzed_Root_Zone_Soil_Moisture/default/${GIBS_DATE}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`, {
      maxZoom: 18,
      maxNativeZoom: 6,
      opacity: 0.7,
      attribution: "NASA SMAP L4 root-zone soil moisture",
    });
    L.control
      .layers(
        { [t("NASA satellite")]: nasa, [t("Close-up photo")]: imagery, [t("Street map")]: streets },
        { [t("Plant greenness (NASA MODIS NDVI)")]: ndvi, [t("Soil moisture (NASA SMAP)")]: smap },
        { position: "topright", collapsed: true },
      )
      .addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pickRef.current(e.latlng.lat, e.latlng.lng));
    // Leaflet already pans with arrow keys; Enter selects the center without a pointer.
    m.on("keydown", (e: L.LeafletKeyboardEvent) => {
      if (e.originalEvent.key === "Enter" && e.originalEvent.target === el.current) {
        e.originalEvent.preventDefault();
        const center = m.getCenter();
        pickRef.current(center.lat, center.lng);
      }
    });
    // MODIS pixels are 250 m: past regional zoom, switch to high-resolution imagery so fields are visible.
    m.on("zoomend", () => {
      if (m.getZoom() >= 11 && m.hasLayer(nasa)) {
        m.removeLayer(nasa);
        imagery.addTo(m);
      } else if (m.getZoom() <= 8 && m.hasLayer(imagery)) {
        m.removeLayer(imagery);
        nasa.addTo(m);
      }
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, [language]);

  useEffect(() => {
    const m = map.current;
    if (!m || !point) return;
    if (!marker.current) {
      marker.current = L.circleMarker([point.lat, point.lon], {
        radius: 9,
        className: "map-pin",
        weight: 3,
        fillOpacity: 1,
      }).addTo(m);
    } else marker.current.setLatLng([point.lat, point.lon]);
    if (m.getZoom() < 11) m.flyTo([point.lat, point.lon], 13, { duration: 0.8, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, [point, language]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lon], focus.zoom, { duration: 0.8, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }, [focus, language]);

  return <>
    <p id="map-keyboard-help" className="jr-note">{t("Keyboard: focus the map, use arrow keys to move, + or − to zoom, and Enter to select the center. Or choose an example below.")}</p>
    <div ref={el} className="map" role="region" aria-label={t("Map: tap your field")} aria-describedby="map-keyboard-help" />
  </>;
}
