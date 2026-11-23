// Cloudflare Pages Function — GET /api/stock -> stock y precio por perfume, leídos en vivo de la planilla de Google de FF Perfumería.
// La web lo usa al abrir para mostrar solo lo que hay en stock y con el precio de la planilla.

const CSV = 'https://docs.google.com/spreadsheets/d/1SO3Ih9wmzqpJNN2JlTTc0FZgqEiQpVCl3jDd7brTjBQ/export?format=csv&gid=1949742334';
// Nombres que en la planilla están escritos distinto que en la web (planilla => web)
const ALIAS = {
  '9pm elixir': '9 PM Elixir', '9 am pour femme': '9 AM Pour Femme', 'amethyst': 'Badee Al Oud Amethyst',
  'asad (negro)': 'Asad', 'badee honor and glory': 'Badee Al Oud Honor & Glory', 'badee negro': 'Badee Al Oud for Glory',
  'badee sublime': 'Badee Al Oud Sublime', 'bareq al dahab': 'Bareeq Al Dhahab', 'dynasti': 'Dynasty', 'ebene': 'Ébène',
  'cedrait boise': 'Cedrat Boisé', 'odyssey ba ha más': 'Odyssey Bahamas', 'odyssey homme white': 'Odyssey Homme White Edition',
  'odyssey mandarín sky': 'Odyssey Mandarin Sky'
};
let cache = null;

function parseCSV(t) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const limpio = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const numero = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };

export async function onRequestGet() {
  if (cache && Date.now() - cache.t < 5 * 60 * 1000) return respuesta(cache.data);
  try {
    const r = await fetch(CSV, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('planilla ' + r.status);
    const rows = parseCSV(await r.text());
    const head = rows[0].map((h) => limpio(h).toLowerCase());
    const iC = head.findIndex((h) => h.startsWith('cantidad')), iP = head.findIndex((h) => h.startsWith('perfume')), iPr = head.findIndex((h) => h.startsWith('precio'));
    if (iC < 0 || iP < 0) throw new Error('columnas no encontradas');
    const data = {};
    for (const f of rows.slice(1)) {
      const nombre = limpio(f[iP]); if (!nombre) continue;
      const stock = numero(f[iC]); if (stock === null) continue;
      const web = ALIAS[nombre.toLowerCase()] || nombre;
      data[web.toLowerCase()] = { stock, precio: iPr >= 0 ? numero(f[iPr]) : null };
    }
    if (Object.keys(data).length < 5) throw new Error('planilla vacía');
    cache = { data, t: Date.now() };
    return respuesta(data);
  } catch (e) {
    console.error('stock', e.message);
    return cache ? respuesta(cache.data) : new Response(JSON.stringify({ error: 'sin planilla' }), { status: 503 });
  }
};
function respuesta(data) {
  return new Response(JSON.stringify({ stock: data }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=120' } });
}
