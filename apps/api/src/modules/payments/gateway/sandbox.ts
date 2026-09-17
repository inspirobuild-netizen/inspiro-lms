import crypto from 'node:crypto';
import type { CreateOrderInput, GatewayOrder, PaymentGateway, WebhookEvent } from './types.js';

/**
 * A pretend bank, so the whole enrolment flow can be exercised end to end
 * before a real integration exists: checkout → hosted page → outcome →
 * settlement → the app polling its way to "welcome".
 *
 * The hosted page lives on our own API (see gateway.routes.ts). It is only
 * reachable for orders this adapter created, and the adapter is only handed
 * out to allow-listed test accounts in production — see index.ts. Nothing
 * here moves money, and the page says so in large letters.
 *
 * The "webhook" is our own page posting back with an HMAC over the outcome,
 * so the verification path is genuinely exercised too rather than skipped
 * because it is a fake.
 */
export class SandboxGateway implements PaymentGateway {
  readonly name = 'sandbox' as const;

  constructor(private readonly publicBaseUrl: string, private readonly secret: string) {}

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const sig = this.sign(input.orderId);
    return {
      paymentUrl: `${this.publicBaseUrl}/api/v1/pay/sandbox/${encodeURIComponent(input.orderId)}?s=${sig}`,
      providerRef: `sbx-${input.orderId}`,
    };
  }

  async parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent> {
    const body = JSON.parse(rawBody) as { orderId?: string; outcome?: string; sig?: string };
    if (!body.orderId || !body.outcome || !body.sig) {
      throw Object.assign(new Error('Malformed sandbox callback'), { statusCode: 400, code: 'BAD_WEBHOOK' });
    }
    const expected = this.sign(`${body.orderId}:${body.outcome}`);
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(body.sig)))) {
      throw Object.assign(new Error('Sandbox callback signature invalid'), { statusCode: 401, code: 'BAD_SIGNATURE' });
    }
    void headers;
    return {
      orderId: body.orderId,
      outcome: body.outcome === 'paid' ? 'paid' : 'failed',
      gatewayPaymentId: body.outcome === 'paid' ? `SBX${Date.now().toString(36).toUpperCase()}` : undefined,
      reason: body.outcome === 'paid' ? undefined : 'Declined in sandbox',
      raw: body,
    };
  }

  /** Signs an order id (page link) or "orderId:outcome" (callback). */
  sign(value: string): string {
    return crypto.createHmac('sha256', this.secret).update(value).digest('hex').slice(0, 32);
  }
}
