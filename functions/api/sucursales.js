// Cloudflare Pages Function — GET /api/sucursales?provincia=X
// Devuelve las sucursales de Correo Argentino de una provincia (código de letra: B, C, X, S, ...),
// leídas del buscador oficial de correoargentino.com.ar. Cache 24 h por provincia.

const WS = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php';
const PROVINCIAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const cache = {};

async function consultar(provincia) {
  const body = new URLSearchParams({ action: 'sucursales', provincia });
  const r = await fetch(WS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.correoargentino.com.ar/formularios/sucursales',
      'User-Agent': 'Mozilla/5.0 (FF Perfumeria)'
    },
    body
  });
  return { status: r.status, text: await r.text() };
}

const t = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
function normalizar(x) {
  const calle = t(x.calle || x.direccion || x.domicilio);
  const nro = t(x.numero || x.nro);
  return {
    id: t(x.id || x.codigo || x.agencia || x.nis),
    nombre: t(x.nombre || x.descripcion || x.sucursal),
    direccion: t(calle + (nro && !calle.includes(nro) ? ' ' + nro : '')),
    localidad: t(x.localidad || x.ciudad),
    cp: t(x.cp || x.codigo_postal || x.codigoPostal),
    horario: t(x.horario || x.horarios)
  };
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const prov = String(url.searchParams.get('provincia') || '').toUpperCase();
  const json = (o, s = 200) => new Response(JSON.stringify(o), {
    status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
  if (prov.length !== 1 || !PROVINCIAS.includes(prov)) return json({ error: 'provincia inválida' }, 400);

  if (url.searchParams.get('raw') === '1') {
    const r = await consultar(prov);
    return json({ status: r.status, muestra: r.text.slice(0, 3000) });
  }

  const hit = cache[prov];
  if (hit && Date.now() - hit.t < 864e5) return json({ sucursales: hit.d });
  try {
    const r = await consultar(prov);
    const data = JSON.parse(r.text);
    const lista = (Array.isArray(data) ? data : (data.sucursales || data.data || Object.values(data)))
      .filter(x => x && typeof x === 'object').map(normalizar).filter(s => s.nombre || s.direccion);
    lista.sort((a, b) => (a.localidad + a.nombre).localeCompare(b.localidad + b.nombre, 'es'));
    cache[prov] = { t: Date.now(), d: lista };
    return json({ sucursales: lista });
  } catch (e) {
    return json({ error: 'no se pudieron cargar las sucursales', sucursales: [] }, 502);
  }
}
