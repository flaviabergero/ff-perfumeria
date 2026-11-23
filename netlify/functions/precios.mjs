// GET /api/precios -> precios de Gilden en pesos al dólar vendedor del BNA
import { preciosGilden } from '../lib/dolar.mjs';
export const config = { path: '/api/precios' };
export default async () => {
  const g = await preciosGilden();
  return new Response(JSON.stringify({ gilden: g }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
  });
};
