import { preciosGilden, esGilden } from '../_lib/dolar.js';
/**
 * FF Perfumería — conector de pago con Mercado Pago (Checkout Pro)
 * Cloudflare Pages Function: /api/pago
 *
 * Necesita UNA variable secreta en Cloudflare (Settings → Variables and Secrets):
 *   MP_ACCESS_TOKEN  → el Access Token de PRODUCCIÓN de tu aplicación de Mercado Pago
 *                      (empieza con "APP_USR-"). La cargás vos en Cloudflare; no va en la página.
 *
 * La página le manda el pedido, este Worker crea el pago en Mercado Pago y devuelve
 * el link (init_point) al que se redirige al cliente.
 */

const CUOTAS_MAX = 3;            // cuotas que se muestran en el checkout
const NOMBRE_TIENDA = "FF PERFUMERIA"; // aparece en el resumen de la tarjeta (máx. 13 caracteres útiles)

export async function onRequest({ request, env }) {
  {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Usá POST" }, 405, cors);
    if (!env.MP_ACCESS_TOKEN) return json({ error: "Falta configurar MP_ACCESS_TOKEN" }, 500, cors);

    let pedido;
    try { pedido = await request.json(); } catch { return json({ error: "Pedido inválido" }, 400, cors); }

    const transferencia = pedido.modo === "transferencia";
    const items = (pedido.items || []).slice(0, 30).map((it) => ({
      title: String(it.title || "Perfume").slice(0, 120),
      quantity: Math.max(1, Math.min(10, parseInt(it.quantity, 10) || 1)),
      unit_price: Math.round(Number(it.unit_price) || 0),
      currency_id: "ARS",
    })).filter((it) => it.unit_price > 0);
    // Gilden: el precio sale del dólar BNA (USD 160 con Mercado Pago), nunca del navegador.
    if (items.some((it) => esGilden(it.title))) {
      const g = await preciosGilden(env);
      if (!g) return json({ error: "Sin cotización del dólar" }, 503, cors);
      items.forEach((it) => { if (esGilden(it.title)) it.unit_price = transferencia ? g.transferencia : g.tarjeta; });
    }
    if (!items.length) return json({ error: "Pedido vacío" }, 400, cors);

    const p = pedido.payer || {};
    const e = pedido.envio || {};
    const volver = String(pedido.volver || "").slice(0, 500);
    const ref = "FF-" + Date.now().toString(36).toUpperCase();

    const preferencia = {
      items,
      payer: {
        name: String(p.name || "").slice(0, 80),
        email: /.+@.+\..+/.test(p.email || "") ? p.email : undefined,
        identification: p.dni ? { type: "DNI", number: String(p.dni).replace(/\D/g, "") } : undefined,
      },
      // Transferencia: precio con descuento, sin tarjetas (dinero en cuenta, transferencia o efectivo).
      payment_methods: transferencia
        ? { installments: 1, excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" }], excluded_payment_methods: [{ id: "consumer_credits" }] }
        : { installments: CUOTAS_MAX },
      statement_descriptor: NOMBRE_TIENDA,
      external_reference: ref + (transferencia ? "-TR" : ""),
      metadata: {
        cliente: p.name, telefono: p.phone, dni: p.dni, email: p.email,
        correo: e.correo, provincia: e.provincia, localidad: e.localidad, sucursal: String(e.sucursal || "").slice(0, 200), cp: e.cp,
      },
      ...(volver.startsWith("https://") ? {
        back_urls: {
          success: volver + "#pago=aprobado&ref=" + ref,
          pending: volver + "#pago=pendiente&ref=" + ref,
          failure: volver + "#pago=rechazado&ref=" + ref,
        },
        auto_return: "approved",
      } : {}),
    };

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.MP_ACCESS_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(preferencia),
    });
    const d = await r.json();
    if (!r.ok || !d.init_point) return json({ error: "Mercado Pago rechazó el pedido", detalle: d.message }, 502, cors);
    return json({ init_point: d.init_point, ref }, 200, cors);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
