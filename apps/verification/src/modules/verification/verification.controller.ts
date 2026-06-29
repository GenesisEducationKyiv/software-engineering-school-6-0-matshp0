import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createVerificationSchema } from './schemas/create.schema.js';

// eslint-disable-next-line @typescript-eslint/require-await
const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    '/verifications',
    { schema: createVerificationSchema },
    async (request, reply) => {
      const result = await fastify.verificationService.createVerification(
        request.body,
      );
      return reply.code(201).send(result);
    },
  );
};

export default plugin;
