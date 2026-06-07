import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

const DOMAIN_ERROR_STATUS: Record<string, number> = {
  NotFoundError: 404,
  ConflictError: 409,
  AlreadyExistsError: 409,
};

export function HttpErrorHandler(
  fastify: FastifyInstance,
): (err: FastifyError, request: FastifyRequest, reply: FastifyReply) => object {
  return (err, request, reply) => {
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

    const domainStatus = DOMAIN_ERROR_STATUS[err.name];
    if (domainStatus) {
      reply.code(domainStatus);
      return { message: err.message };
    }

    reply.code(err.statusCode ?? 500);

    let message = 'Internal Server Error';
    if (err.statusCode && err.statusCode < 500) {
      message = err.message;
    }

    return { message };
  };
}
