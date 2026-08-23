const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
const query = `[out:json][timeout:10];(way[waterway](-19.05,-48.40,-18.80,-48.12);way[natural=water](-19.05,-48.40,-18.80,-48.12);way[natural=wood](-19.05,-48.40,-18.80,-48.12);way[landuse=forest](-19.05,-48.40,-18.80,-48.12);way[leisure=park](-19.05,-48.40,-18.80,-48.12);way[boundary=protected_area](-19.05,-48.40,-18.80,-48.12);way[landuse~"residential|commercial|industrial|retail"](-19.05,-48.40,-18.80,-48.12););out tags geom;`;
async function request(ep, ms=11000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(ep, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent': 'MALHA/8.1'
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  let lastError = null;
  for (const ep of ENDPOINTS) {
    try {
      const r = await request(ep);
      if (!r.ok) throw new Error(`${ep} ${r.status}`);
      const data = await r.json();
      data.meta = { source: 'OpenStreetMap/Overpass', endpoint: ep, collected_at: new Date().toISOString() };
      return res.status(200).json(data);
    } catch (e) { lastError = e; }
  }
  return res.status(502).json({ error: 'Overpass indisponível', detail: String(lastError?.message || lastError) });
}
