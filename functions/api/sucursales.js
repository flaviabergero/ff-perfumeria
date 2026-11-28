// Cloudflare Pages Function — sucursales de Correo Argentino para el checkout.
//   GET /api/sucursales?provincia=X              -> { localidades: [...] }
//   GET /api/sucursales?provincia=X&localidad=Y  -> { sucursales: [...] }
// Lee el buscador público de correoargentino.com.ar (pedido de la dueña). Cache 24 h.

const WS = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php';
const PROVINCIAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const cache = new Map();

async function ws(params) {
  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 864e5) return hit.v;
  const r = await fetch(WS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.correoargentino.com.ar/formularios/sucursales'
    },
    body: new URLSearchParams(params)
  });
  const txt = await r.text();
  const i = txt.search(/[\[{]/);
  const v = { txt, data: (() => { try { return JSON.parse(i >= 0 ? txt.slice(i) : txt); } catch { return null; } })() };
  if (v.data) cache.set(key, { t: Date.now(), v });
  return v;
}

const t = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const lista = (d) => Array.isArray(d) ? d : (d && typeof d === 'object' ? Object.values(d).find(Array.isArray) || Object.values(d) : []);

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const prov = String(url.searchParams.get('provincia') || '').toUpperCase();
  const loc = t(url.searchParams.get('localidad')).slice(0, 80);
  const debug = url.searchParams.get('debug') === '1';
  const json = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
  if (prov.length !== 1 || !PROVINCIAS.includes(prov)) return json({ error: 'provincia inválida' }, 400);

  try {
    if (!loc) {
      const r = await ws({ action: 'localidades', provincia: prov });
      if (debug) return json({ muestra: r.txt.replace(/<[^>]+>/g, ' ').replace(/\/[\w\/.-]+\.php/g, '').slice(0, 1500) });
      const locs = [...new Set(lista(r.data).map(x => t(typeof x === 'string' ? x : (x.nombre || x.localidad || x.descripcion || x.name))).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'));
      return json({ localidades: locs });
    }
    const r = await ws({ action: 'sucursales', provincia: prov, localidad: loc });
    if (debug) return json({ muestra: r.txt.replace(/<[^>]+>/g, ' ').replace(/\/[\w\/.-]+\.php/g, '').slice(0, 1500) });
    const suc = lista(r.data).filter(x => x && typeof x === 'object').map(x => ({
      nombre: t(x.nombre || x.descripcion || x.sucursal),
      direccion: t([x.calle || x.direccion || x.domicilio, x.numero || x.nro].filter(Boolean).join(' ')),
      localidad: t(x.localidad || loc),
      cp: t(x.cp || x.codigo_postal || x.codigoPostal),
      horario: t(x.horario || x.horarios)
    })).filter(s => s.nombre || s.direccion);
    return json({ sucursales: suc });
  } catch (e) {
    return json({ error: 'no se pudieron cargar las sucursales' }, 502);
  }
}
