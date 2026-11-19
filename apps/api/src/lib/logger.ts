import pino, { type LoggerOptions } from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

// Query-string values that must never reach a log: the playback token on
// /api/v1/stream/…, the Bunny webhook's shared secret, signed-URL signatures.
const SECRET_QUERY = /([?&](?:token|key|secret|signature|sig|password)=)[^&#\s]*/gi;

/** The URL with every secret query value replaced by [REDACTED]. */
export function redactUrl(url: string): string {
  return url.replace(SECRET_QUERY, '$1[REDACTED]');
}

type LoggedRequest = {
  method?: string;
  url?: string;
  hostname?: string;
  ip?: string;
  socket?: { remotePort?: number };
};

// Fastify lets a logger instance's own serializers win over its defaults, so
// this replaces its request serializer (same fields) for every request log.
export const serializers = {
  req: (req: LoggedRequest) => ({
    method: req.method,
    url: req.url === undefined ? undefined : redactUrl(req.url),
    hostname: req.hostname,
    remoteAddress: req.ip,
    remotePort: req.socket?.remotePort,
  }),
};

const options: LoggerOptions = {
  level: isDev ? 'debug' : 'info',
  redact: ['req.headers.authorization', 'phone', 'otp', 'password', 'token'],
  serializers,
};

if (isDev) {
  options.transport = { target: 'pino-pretty', options: { colorize: true } };
}

export const logger = pino(options);
