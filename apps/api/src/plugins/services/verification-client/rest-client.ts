import type { CreateVerificationResponse } from '@github-notifier/contracts/verification/http';
import type { ILogger } from '../../../common/interfaces/logger.interface.js';
import type { VerificationClient } from './index.js';

export interface RestVerificationClientDeps {
  baseUrl: string;
  log: ILogger;
}

export function createRestVerificationClient(
  deps: RestVerificationClientDeps,
): VerificationClient {
  const { baseUrl, log } = deps;
  const endpoint = `${baseUrl}/internal/verifications`;
  const cancelEndpoint = `${endpoint}/cancel`;

  return {
    async createVerification(req) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const body = await response.text();
        log.error(
          { status: response.status, body },
          'Verification service request failed',
        );
        throw new Error(`Verification service responded ${response.status}`);
      }

      return (await response.json()) as CreateVerificationResponse;
    },

    async cancelVerification(req) {
      const response = await fetch(cancelEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const body = await response.text();
        log.error(
          { status: response.status, body },
          'Verification cancel request failed',
        );
        throw new Error(`Verification service responded ${response.status}`);
      }
    },
  };
}
