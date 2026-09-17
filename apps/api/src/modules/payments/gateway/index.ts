import { HdfcGateway } from './hdfc.js';
import { SandboxGateway } from './sandbox.js';
import type { GatewayName, PaymentGateway } from './types.js';

/**
 * Which bank a given student is sent to.
 *
 *   PAYMENT_GATEWAY=hdfc      → the real bank (once its adapter is configured)
 *   PAYMENT_GATEWAY=sandbox   → the pretend bank for everyone (staging only)
 *   unset                     → no online payment; the app shows the office route
 *
 * Independently of the above, phones listed in PAYMENT_SANDBOX_PHONES always
 * get the sandbox. That is how the flow is tested on production with the
 * test account while real students see the office route — or, later, the
 * real bank — and never a fake one.
 */
export function resolveGatewayFor(studentPhone: string): PaymentGateway | null {
  const publicBase = (process.env['PUBLIC_API_URL'] ?? 'https://api.inspiroiasacademy.in').replace(/\/$/, '');
  const secret = process.env['PAYMENT_SANDBOX_SECRET'] ?? process.env['JWT_SECRET'] ?? 'sandbox';

  const allowlist = (process.env['PAYMENT_SANDBOX_PHONES'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.includes(studentPhone)) return new SandboxGateway(publicBase, secret);

  const mode = (process.env['PAYMENT_GATEWAY'] ?? '').trim().toLowerCase() as GatewayName | '';
  if (mode === 'sandbox') return new SandboxGateway(publicBase, secret);
  if (mode === 'hdfc') return new HdfcGateway();
  return null;
}

/** For webhooks: the adapter is named by the order id prefix it minted. */
export function gatewayByName(name: string): PaymentGateway | null {
  const publicBase = (process.env['PUBLIC_API_URL'] ?? 'https://api.inspiroiasacademy.in').replace(/\/$/, '');
  const secret = process.env['PAYMENT_SANDBOX_SECRET'] ?? process.env['JWT_SECRET'] ?? 'sandbox';
  if (name === 'sandbox') return new SandboxGateway(publicBase, secret);
  if (name === 'hdfc') return new HdfcGateway();
  return null;
}

export function publicApiUrl(): string {
  return (process.env['PUBLIC_API_URL'] ?? 'https://api.inspiroiasacademy.in').replace(/\/$/, '');
}
