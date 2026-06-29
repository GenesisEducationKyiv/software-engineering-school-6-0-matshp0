import * as grpc from '@grpc/grpc-js';
import type { FastifyBaseLogger } from 'fastify';
import {
  MailVerificationServiceService,
  type MailVerificationServiceServer,
} from '@github-notifier/contracts/verification/grpc';
import type { createVerificationService } from '../modules/verification/verification.service.js';

type VerificationService = ReturnType<typeof createVerificationService>;

export interface GrpcServerDeps {
  verificationService: VerificationService;
  log: FastifyBaseLogger;
  port: number;
}

function internalError(message: string): grpc.ServerErrorResponse {
  return Object.assign(new Error(message), { code: grpc.status.INTERNAL });
}

export function buildGrpcServer(deps: GrpcServerDeps): grpc.Server {
  const { verificationService, log } = deps;

  const impl: MailVerificationServiceServer = {
    createVerification(call, callback) {
      verificationService
        .createVerification({
          email: call.request.email,
          repoFullName: call.request.repoFullName,
          unsubToken: call.request.unsubToken,
        })
        .then((result) => callback(null, { token: result.token }))
        .catch((err: unknown) => {
          log.error({ err }, 'gRPC CreateVerification failed');
          callback(internalError('createVerification failed'), null);
        });
    },

    cancelVerification(call, callback) {
      verificationService
        .cancelVerification({ token: call.request.token })
        .then(() => callback(null, {}))
        .catch((err: unknown) => {
          log.error({ err }, 'gRPC CancelVerification failed');
          callback(internalError('cancelVerification failed'), null);
        });
    },
  };

  const server = new grpc.Server();
  server.addService(MailVerificationServiceService, impl);
  return server;
}

export function startGrpcServer(deps: GrpcServerDeps): Promise<grpc.Server> {
  const server = buildGrpcServer(deps);
  const { promise, resolve, reject } = Promise.withResolvers<grpc.Server>();

  server.bindAsync(
    `0.0.0.0:${deps.port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        reject(err);
        return;
      }
      deps.log.info({ port: boundPort }, 'gRPC server listening');
      resolve(server);
    },
  );

  return promise;
}
