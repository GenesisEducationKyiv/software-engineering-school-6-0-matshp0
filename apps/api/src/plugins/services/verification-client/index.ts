import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type {
  CancelVerificationRequest,
  CreateVerificationRequest,
  CreateVerificationResponse,
} from '@github-notifier/contracts/verification/http';
import { createRestVerificationClient } from './rest-client.js';
import { createGrpcVerificationClient } from './grpc-client.js';

export interface VerificationClient {
  createVerification(
    req: CreateVerificationRequest,
  ): Promise<CreateVerificationResponse>;
  cancelVerification(req: CancelVerificationRequest): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    verificationClient: VerificationClient;
  }
}

export default fp(
  (fastify: FastifyInstance, _opts: object, done: () => void) => {
    const transport = fastify.config.VERIFICATION_TRANSPORT;

    const client =
      transport === 'grpc'
        ? createGrpcVerificationClient({
            address: fastify.config.MAIL_VERIFICATION_GRPC_ADDR,
            log: fastify.log,
          })
        : createRestVerificationClient({
            baseUrl: fastify.config.MAIL_VERIFICATION_URL,
            log: fastify.log,
          });

    fastify.log.info({ transport }, 'Verification client initialised');
    fastify.decorate('verificationClient', client);
    done();
  },
  { name: 'verificationClient' },
);
