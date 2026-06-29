import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/index.js';
import type {
  ConfirmationEmailEvent,
  ReleaseEmailEvent,
} from '@github-notifier/contracts/mailer';
import type { ISubscriptionRepository } from '../../common/interfaces/repositories/subscription.repository.interface.js';
import type { IGithubService } from '../../common/interfaces/services/github.service.interface.js';
import type { ILogger } from '../../common/interfaces/logger.interface.js';
import type { VerificationClient } from '../../plugins/services/verification-client.js';

export interface Notifier {
  sendConfirmationEmail(event: ConfirmationEmailEvent): Promise<void>;
  sendReleaseNotification(event: ReleaseEmailEvent): Promise<void>;
}

export interface SubscriptionServiceDeps {
  githubService: IGithubService;
  subscriptionRepository: ISubscriptionRepository;
  verificationClient: VerificationClient;
  log: ILogger;
}

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: ReturnType<typeof createSubscriptionService>;
  }
}

export function createSubscriptionService(deps: SubscriptionServiceDeps) {
  const { githubService, subscriptionRepository, verificationClient, log } =
    deps;

  return {
    async subscribe(email: string, repoFullName: string) {
      log.info({ email, repo: repoFullName }, 'Creating subscription');
      const ghRepo = await githubService.ensureRepoExists(repoFullName);
      let subscription;
      try {
        subscription = await subscriptionRepository.create({
          email,
          repositoryId: ghRepo.id,
        });
      } catch (error) {
        if (error instanceof AlreadyExistsError) {
          throw new ConflictError(
            'Email already subscribed to this repository',
          );
        }
        throw error;
      }
      log.info(
        { subscriptionId: subscription.id, email, repo: repoFullName },
        'Subscription created, requesting verification',
      );
      const { token } = await verificationClient.createVerification({
        email,
        repoFullName,
        unsubToken: subscription.unsubToken,
      });
      await subscriptionRepository.updateById(subscription.id, {
        confirmToken: token,
      });
    },

    async confirmSubscription(token: string) {
      const subscription =
        await subscriptionRepository.findByConfirmToken(token);
      if (!subscription) {
        throw new NotFoundError('Token not found');
      }
      await subscriptionRepository.updateById(subscription.id, {
        status: 'confirmed',
      });
      log.info(
        { subscriptionId: subscription.id, email: subscription.email },
        'Subscription confirmed',
      );
    },

    async unsubscribe(token: string) {
      const subscription = await subscriptionRepository.findByUnsubToken(token);
      if (!subscription) {
        throw new NotFoundError('Token not found');
      }
      await subscriptionRepository.delete(subscription.id);
      log.info(
        { subscriptionId: subscription.id, email: subscription.email },
        'Subscription removed',
      );
    },

    async getSubscriptionsByEmail(email: string) {
      const subscriptions = await subscriptionRepository.findAllByEmail(email, {
        status: 'confirmed',
      });
      return subscriptions.map((s) => ({
        id: s.id,
        email: s.email,
        repository: s.repository,
      }));
    },
  };
}

export default fp(
  (fastify: FastifyInstance, _opts, done) => {
    fastify.decorate(
      'subscriptionService',
      createSubscriptionService({
        githubService: fastify.githubService,
        subscriptionRepository: fastify.subscriptionRepository,
        verificationClient: fastify.verificationClient,
        log: fastify.log,
      }),
    );
    done();
  },
  {
    name: 'subscriptionService',
    dependencies: ['ghRepoRepository', 'githubService', 'verificationClient'],
  },
);
