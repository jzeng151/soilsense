// Warms the D1 cache for the demo farms so the live demo never waits on NASA/USDA.
// Usage: ADMIN_TOKEN=<your admin token> node scripts/prefetch-demo.mjs https://soilsense.<you>.workers.dev
// The dashboard API requires sign-in; this script authenticates with the ADMIN_TOKEN secret instead.
const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const auth = process.env.ADMIN_TOKEN ? { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } : {};
if (!process.env.ADMIN_TOKEN) console.warn("ADMIN_TOKEN is not set: requests will get 401 (sign-in required).");
const farms = [
  { name: "Story County, IA", lat: 42.0563, lon: -93.495, irrigated: false, recentCrops: ["corn", "corn"] },
  { name: "Champaign County, IL", lat: 40.048, lon: -88.33, irrigated: false, recentCrops: ["soybean", "corn"] },
  { name: "Finney County, KS", lat: 38.1095, lon: -100.706, irrigated: true, recentCrops: ["corn", "corn"] },
  { name: "Lancaster County, NE", lat: 40.73, lon: -96.55, irrigated: false, recentCrops: ["corn", "soybean"] },
  // ZIP centroids used by the phone demo:
  { name: "Ames, IA (50010)", lat: 42.0379, lon: -93.6003, irrigated: false, recentCrops: ["corn"] },
];
for (const f of farms) {
  const t = Date.now();
  const field = await fetch(`${base}/api/field?lat=${f.lat}&lon=${f.lon}`, { headers: auth });
  const plan = await fetch(`${base}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ lat: f.lat, lon: f.lon, irrigated: f.irrigated, priority: "balanced", recentCrops: f.recentCrops }),
  });
  const body = await plan.json();
  console.log(`${f.name}: field ${field.status}, plan ${plan.status} in ${Date.now() - t} ms → ${body.plans?.[0]?.label ?? body.error}`);
}
