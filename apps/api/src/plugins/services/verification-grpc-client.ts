import * as grpc from '@grpc/grpc-js';
import { MailVerificationServiceClient } from '@github-notifier/contracts/grpc';
import type { CreateVerificationResponse } from '@github-notifier/contracts/verification';
import type { ILogger } from '../../common/interfaces/logger.interface.js';
import type { VerificationClient } from './verification-client.js';

export interface GrpcVerificationClientDeps {
  address: string;
  log: ILogger;
}

export function createGrpcVerificationClient(
  deps: GrpcVerificationClientDeps,
): VerificationClient {
  const { address, log } = deps;
  const client = new MailVerificationServiceClient(
    address,
    grpc.credentials.createInsecure(),
  );

  return {
    createVerification(req) {
      const { promise, resolve, reject } =
        Promise.withResolvers<CreateVerificationResponse>();
      client.createVerification(
        {
          email: req.email,
          repoFullName: req.repoFullName,
          unsubToken: req.unsubToken,
        },
        (err, res) => {
          if (err) {
            log.error({ err }, 'gRPC createVerification failed');
            reject(err);
            return;
          }
          resolve({ token: res.token });
        },
      );
      return promise;
    },

    cancelVerification(req) {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      client.cancelVerification({ token: req.token }, (err) => {
        if (err) {
          log.error({ err }, 'gRPC cancelVerification failed');
          reject(err);
          return;
        }
        resolve();
      });
      return promise;
    },
  };
}
