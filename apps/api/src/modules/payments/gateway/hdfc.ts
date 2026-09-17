import { GatewayError, type CreateOrderInput, type GatewayOrder, type PaymentGateway, type WebhookEvent } from './types.js';

/**
 * HDFC — placeholder until the bank's integration kit and test credentials
 * arrive. Every method refuses loudly with a code the app understands, so
 * selecting this adapter before it is configured shows students the
 * office/bank-transfer route rather than a broken pay button.
 *
 * What goes here once the kit is in hand (same shape as the ICICI adapter
 * already live in the parent app):
 *   - createOrder: sign the order fields with the merchant key and return the
 *     bank's hosted-page URL, or the URL of our own page that auto-submits
 *     the signed form if the bank requires a POST.
 *   - parseWebhook: verify the bank's signature over the raw body BEFORE
 *     reading any field, map its status vocabulary to paid/failed/pending,
 *     and pull out the bank transaction id.
 *   - fetchStatus: the bank's order-status API, for the polling nudge and
 *     reconciliation.
 * Nothing above this file changes.
 */
export class HdfcGateway implements PaymentGateway {
  readonly name = 'hdfc' as const;

  private notReady(): never {
    throw new GatewayError(
      'Online payment is not available yet. Pay at the office or by bank transfer and we will enrol you.',
      'GATEWAY_NOT_CONFIGURED',
      503,
    );
  }

  async createOrder(_input: CreateOrderInput): Promise<GatewayOrder> {
    return this.notReady();
  }

  async parseWebhook(_headers: Record<string, unknown>, _rawBody: string): Promise<WebhookEvent> {
    return this.notReady();
  }
}
