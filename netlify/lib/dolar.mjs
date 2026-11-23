// Dólar vendedor (billete) del Banco Nación — misma lógica que gildenprofumi.com.
let cache = null;
const VIGENCIA = 15 * 60 * 1000; // consulta el BNA cada 15 minutos
const numero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const razonable = (v) => Number.isFinite(v) && v > 100 && v < 100000;

async function dolarBNA() {
  const r = await fetch('https://www.bna.com.ar/Personas', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FFPerfumeriaBot/1.0)' },
    signal: AbortSignal.timeout(6000)
  });
  if (!r.ok) throw new Error(`BNA ${r.status}`);
  const html = await r.text();
  const m = html.match(/Dolar U\.S\.A\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>/i);
  const venta = m && numero(m[2]);
  if (!razonable(venta)) throw new Error('BNA sin cotización');
  return { venta, fuente: 'BNA' };
}
async function dolarRespaldo() {
  const r = await fetch('https://dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`dolarapi ${r.status}`);
  const d = await r.json();
  if (!razonable(Number(d.venta))) throw new Error('dolarapi sin cotización');
  return { venta: Number(d.venta), fuente: 'oficial' };
}
export async function cotizacion() {
  if (cache && Date.now() - cache.t < VIGENCIA) return cache;
  let c = null;
  for (const f of [dolarBNA, dolarRespaldo]) { try { c = await f(); break; } catch (e) { console.error('Cotización', e.message); } }
  if (!c && cache) return cache;
  if (!c) return null;
  cache = { ...c, t: Date.now() };
  return cache;
}
// Precios de Gilden en pesos: USD 140 por transferencia, USD 160 con tarjeta/Mercado Pago (como en gildenprofumi.com).
export async function preciosGilden() {
  const usd = Number(process.env.GILDEN_USD || 140);
  const usdTarjeta = Number(process.env.GILDEN_USD_TARJETA || 160);
  const c = await cotizacion();
  if (!c) return null;
  const pesos = (u) => Math.ceil((u * c.venta) / 100) * 100;
  return { transferencia: pesos(usd), tarjeta: pesos(usdTarjeta), usd, usdTarjeta, dolar: c.venta, fuente: c.fuente };
}
export const esGilden = (titulo) => /^gilden\b/i.test(String(titulo || '').trim());
