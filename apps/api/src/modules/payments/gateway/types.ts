/**
 * One interface, several banks.
 *
 * The enrolment flow only ever needs three things from a payment provider:
 * turn an order into a URL the student can pay at, tell us what a callback
 * means, and (optionally) answer "what happened to order X" when a callback
 * never arrived. Everything bank-specific — signatures, field names, hosted
 * page quirks — stays inside one adapter file, so swapping HDFC in when its
 * integration kit arrives touches nothing above this line.
 *
 * Amounts are rupees as a number; adapters convert to paise if their bank
 * wants it.
 */

export type GatewayName = 'sandbox' | 'hdfc';

export type CreateOrderInput = {
  /** Our id for the order; unique, ≤ 40 chars, safe in a URL. */
  orderId: string;
  amount: number;
  currency: 'INR';
  description: string;
  student: { id: string; name: string; phone: string; email?: string | null };
  /** Where the bank sends the browser afterwards. */
  returnUrl: string;
  /** Where the bank posts the server-to-server result. */
  webhookUrl: string;
};

export type GatewayOrder = {
  paymentUrl: string;
  /** The bank's own reference for the order, if it issues one at creation. */
  providerRef?: string;
};

export type GatewayOutcome = 'paid' | 'failed' | 'pending';

export type WebhookEvent = {
  orderId: string;
  outcome: GatewayOutcome;
  /** The bank's transaction id — what a student quotes to the office. */
  gatewayPaymentId?: string;
  /** Rupees actually settled, when the bank reports it. */
  amount?: number;
  reason?: string;
  raw: unknown;
};

export interface PaymentGateway {
  readonly name: GatewayName;
  createOrder(input: CreateOrderInput): Promise<GatewayOrder>;
  /**
   * Verify and decode a callback. MUST throw on a bad signature: a webhook is
   * an unauthenticated POST from the internet, and an unverified "paid" is an
   * enrolment for free.
   */
  parseWebhook(headers: Record<string, unknown>, rawBody: string): Promise<WebhookEvent>;
  /**
   * Ask the bank directly. Used as a nudge while the app is polling and the
   * webhook is late, and by any later reconciliation job. Optional because a
   * hosted-page bank may not offer it.
   */
  fetchStatus?(orderId: string): Promise<WebhookEvent | null>;
}

export class GatewayError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, code: string, statusCode = 503) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
