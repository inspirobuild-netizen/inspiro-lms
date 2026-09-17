import type { FastifyInstance } from 'fastify';
import { settleGatewayPayment } from '../../enrollment/checkout.service.js';
import { gatewayByName } from './index.js';
import { SandboxGateway } from './sandbox.js';
import { logger } from '../../../lib/logger.js';

/**
 * The bank-facing edge: webhooks in, and the pages a browser lands on.
 *
 * Registered as its own plugin so it can keep the RAW request body. Bank
 * signatures are computed over the bytes they sent; Fastify's default JSON
 * parser would hand us a re-serialised object and every signature would
 * fail. Both parsers below return the body as a string, untouched.
 */
export default async function gatewayRoutes(app: FastifyInstance) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(['application/json', 'application/x-www-form-urlencoded', 'text/plain'], { parseAs: 'string' }, (_req, body, done) => done(null, body));
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  // ── Bank → us ───────────────────────────────────────────────────────────────
  app.post('/payments/webhook/:provider', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const gw = gatewayByName(provider);
    if (!gw) return reply.status(404).send({ success: false, error: { code: 'UNKNOWN_PROVIDER', message: 'Unknown provider' } });

    let event;
    try {
      event = await gw.parseWebhook(req.headers as Record<string, unknown>, String(req.body ?? ''));
    } catch (e) {
      // A bad signature is logged and refused; it is never a 500, which some
      // banks treat as "retry forever".
      logger.warn({ err: e, provider }, 'webhook rejected');
      const status = (e as { statusCode?: number }).statusCode ?? 400;
      return reply.status(status).send({ success: false, error: { code: 'WEBHOOK_REJECTED', message: 'Rejected' } });
    }

    const result = await settleGatewayPayment(event);
    // 200 whatever we decided: the bank's job ends at delivery.
    return reply.send({ success: true, data: result });
  });

  // ── Browser-facing pages ────────────────────────────────────────────────────
  // Where the bank sends the student's browser afterwards. It states nothing
  // about the outcome on purpose — the app learns that from the server.
  app.get('/pay/return/:orderId', async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(page(`
      <div class="ok">✓</div>
      <h1>Thanks — you can go back to the Inspiro app</h1>
      <p>Your payment is being confirmed with the bank. The app will show your course the moment it clears.</p>
      <p class="muted">You can close this tab.</p>
    `));
  });

  // ── Sandbox: the pretend bank ───────────────────────────────────────────────
  // Only orders minted by the sandbox adapter carry a valid link signature,
  // so this page cannot be used against a real order.
  app.get('/pay/sandbox/:orderId', async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const { s } = req.query as { s?: string };
    const gw = gatewayByName('sandbox') as SandboxGateway | null;
    if (!gw || !orderId.startsWith('sandbox_') || !s || gw.sign(orderId) !== s) {
      return reply.status(403).type('text/html; charset=utf-8').send(page('<h1>Not a valid test order</h1>'));
    }
    return reply.type('text/html; charset=utf-8').send(page(`
      <div class="tag">TEST MODE — no money moves</div>
      <h1>Inspiro test bank</h1>
      <p>Order <code>${esc(orderId)}</code></p>
      <p>Choose what the bank should say happened:</p>
      <form method="post" action="/api/v1/pay/sandbox/${encodeURIComponent(orderId)}/outcome">
        <input type="hidden" name="s" value="${esc(s)}">
        <button name="outcome" value="paid" class="pay">Payment successful</button>
        <button name="outcome" value="failed" class="fail">Payment failed</button>
      </form>
    `));
  });

  app.post('/pay/sandbox/:orderId/outcome', async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const form = new URLSearchParams(String(req.body ?? ''));
    const s = form.get('s') ?? '';
    const outcome = form.get('outcome') === 'paid' ? 'paid' : 'failed';
    const gw = gatewayByName('sandbox') as SandboxGateway | null;
    if (!gw || !orderId.startsWith('sandbox_') || gw.sign(orderId) !== s) {
      return reply.status(403).type('text/html; charset=utf-8').send(page('<h1>Not a valid test order</h1>'));
    }
    // Goes through the same signed-callback path a real bank would, so the
    // verification code is exercised rather than bypassed.
    const event = await gw.parseWebhook({}, JSON.stringify({ orderId, outcome, sig: gw.sign(`${orderId}:${outcome}`) }));
    await settleGatewayPayment(event);
    return reply.redirect(`/api/v1/pay/return/${encodeURIComponent(orderId)}`);
  });
}

function esc(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function page(body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inspiro</title>
<style>
  body{margin:0;background:#0B1020;color:#E6EBF2;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  main{max-width:420px;width:100%;text-align:center}
  h1{font-size:22px;margin:12px 0 8px}
  p{color:#B7C0CF;margin:6px 0}
  .muted{color:#7A8698;font-size:14px}
  .ok{width:64px;height:64px;border-radius:50%;background:#1F5C8B;color:#fff;font-size:34px;line-height:64px;margin:0 auto 10px}
  .tag{display:inline-block;background:#A85B27;color:#fff;font-size:12px;letter-spacing:.08em;padding:4px 10px;border-radius:999px;margin-bottom:14px}
  code{background:#182130;padding:2px 6px;border-radius:6px;font-size:13px}
  form{display:grid;gap:10px;margin-top:18px}
  button{padding:14px;border:0;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer}
  .pay{background:#1F5C8B;color:#fff}.fail{background:#2C3949;color:#E6EBF2}
</style></head><body><main>${body}</main></body></html>`;
}
