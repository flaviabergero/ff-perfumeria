// Cloudflare Pages Function — GET /api/precios: precios de Gilden en pesos al dólar vendedor del BNA
import { preciosGilden } from '../_lib/dolar.js';
export async function onRequestGet({ env }) {
  const g = await preciosGilden(env);
  return new Response(JSON.stringify({ gilden: g }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
  });
}
