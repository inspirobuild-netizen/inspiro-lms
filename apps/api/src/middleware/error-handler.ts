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
