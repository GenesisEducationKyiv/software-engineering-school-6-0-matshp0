import path from 'path';
import sensible from '@fastify/sensible';
import fastifyAutoload from '@fastify/autoload';
import formbody from '@fastify/formbody';
import { FastifyError, FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import metricsPlugin from 'fastify-metrics';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from './common/errors/index.js';

export default async function serviceApp(fastify: FastifyInstance) {
  await fastify.register(metricsPlugin.default, { endpoint: '/metrics' });

  fastify.register(formbody);

  fastify.register(sensible);

  fastify.register(helmet, { contentSecurityPolicy: false });

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/config'),
  });

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/infrastructure'),
  });

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/repositories'),
  });

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'plugins/services'),
  });

  await fastify.register(fastifyAutoload, {
    dir: path.join(import.meta.dirname, 'modules'),
    dirNameRoutePrefix: false,
    options: { prefix: '/api' },
  });

  fastify.setErrorHandler((err: FastifyError, request, reply) => {
    fastify.log.error(
      {
        err,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          params: request.params,
        },
      },
      'Unhandled error occurred',
    );

    if (err instanceof DomainError) {
      const statusCode = mapDomainErrorToStatus(err);
      reply.code(statusCode);
      return { message: err.message };
    }

    reply.code(err.statusCode ?? 500);

    let message = 'Internal Server Error';
    if (err.statusCode && err.statusCode < 500) {
      message = err.message;
    }

    return { message };
  });
}

function mapDomainErrorToStatus(err: DomainError): number {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  return 500;
}
