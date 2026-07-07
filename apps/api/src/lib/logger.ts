import pino, { type LoggerOptions } from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

const options: LoggerOptions = {
  level: isDev ? 'debug' : 'info',
  redact: ['req.headers.authorization', 'phone', 'otp', 'password', 'token'],
};

if (isDev) {
  options.transport = { target: 'pino-pretty', options: { colorize: true } };
}

export const logger = pino(options);
