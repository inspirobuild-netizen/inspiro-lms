import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../lib/logger.js';

export function errorHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  logger.error({ err: error, url: req.url, method: req.method }, 'Request error');

  if (error.validation) {
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.validation,
      },
    });
    return;
  }

  // Postgres 22P02 = invalid_text_representation. In practice this is always a
  // malformed path/query param reaching a uuid/enum column (e.g. GET
  // /courses/my-progress falling through to /courses/:id), which is a client
  // error — not a 500. Without this it surfaced as an "internal error" carrying
  // the raw Postgres code, which both misleads callers and leaks internals.
  if ((error as { code?: string }).code === '22P02') {
    reply.status(400).send({
      success: false,
      error: { code: 'INVALID_PARAMETER', message: 'Invalid parameter format' },
    });
    return;
  }

  const statusCode = error.statusCode ?? 500;
  const isProduction = process.env['NODE_ENV'] === 'production';

  reply.status(statusCode).send({
    success: false,
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: isProduction && statusCode >= 500 ? 'An internal error occurred' : error.message,
    },
  });
}
