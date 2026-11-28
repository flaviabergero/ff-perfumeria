// Cloudflare Pages Function — sucursales de Correo Argentino para el checkout.
//   GET /api/sucursales?provincia=X              -> { localidades: [{id, nombre}] }   (solo localidades con sucursal)
//   GET /api/sucursales?provincia=X&localidad=ID -> { sucursales: [{nombre, direccion, localidad}] }
// Lee el buscador público de correoargentino.com.ar (correoargentino.com.ar/formularios/sucursales). Cache 24 h.

const WS = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php';
const PROVINCIAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const cache = new Map();
const DIA = 864e5;

async function ws(params) {
  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < DIA) return hit.v;
  const r = await fetch(WS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.correoargentino.com.ar/formularios/sucursales',
      'User-Agent': 'Mozilla/5.0 (FF Perfumeria checkout)'
    },
    body: new URLSearchParams(params)
  });
  if (!r.ok) throw new Error('correo ' + r.status);
  const v = await r.text();
  cache.set(key, { t: Date.now(), v });
  return v;
}

const sinTags = (s) => String(s || '').replace(/<br\s*\/?>/gi, '|').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
const titulo = (s) => s.toLowerCase().replace(/(^|[\s(/.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function parsear(html) {
  const out = [];
  const re = /var\s+contenido\s*=\s*([\s\S]*?)<\/div>';/g;
  let m;
  while ((m = re.exec(html))) {
    const c = m[1];
    const nombre = sinTags((c.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1]);
    const dir = sinTags((c.match(/<span[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
    const k = nombre.match(/^(SUCURSAL|UNIDAD POSTAL)\s*:?\s*(.*)$/i);
    if (!k) continue;                                   // descarta agencias/otros pines
    const [calle, loc] = (dir.split('|').map(x => x.trim()).concat(['', '']));
    out.push({
      nombre: titulo(k[1]) + ' ' + titulo(k[2]),
      direccion: titulo(calle.replace(/\s*N°\s*/i, ' ')),
      localidad: titulo(loc || '')
    });
  }
  const vistos = new Set();
  return out.filter(s => { const k = s.nombre + s.direccion; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const prov = String(url.searchParams.get('provincia') || '').toUpperCase();
  const loc = String(url.searchParams.get('localidad') || '').replace(/\D/g, '').slice(0, 8);
  const json = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': s === 200 ? 'public, max-age=21600' : 'no-store' }
  });
  if (prov.length !== 1 || !PROVINCIAS.includes(prov)) return json({ error: 'provincia inválida' }, 400);

  try {
    if (!loc) {
      const txt = await ws({ action: 'localidadesconsucursales', provincia: prov });
      const data = JSON.parse(txt.slice(Math.max(0, txt.indexOf('{'))));
      const lista = ((data.Localidades || {}).lista || [])
        .map(x => ({ id: String(x.id), nombre: titulo(String(x.nombre || '').trim()) }))
        .filter(x => x.id && x.nombre)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return json({ localidades: lista });
    }
    const html = await ws({ action: 'sucursales', provincia: prov, localidad: loc, departamento: '', nis: '', servicios: '' });
    return json({ sucursales: parsear(html) });
  } catch (e) {
    return json({ error: 'no se pudieron cargar las sucursales' }, 502);
  }
}
