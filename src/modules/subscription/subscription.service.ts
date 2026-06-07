import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  AlreadyExistsError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/index.ts';
import type { Notifier } from '../../common/notifier.ts';
import type { ISubscriptionRepository } from '../../common/interfaces/repositories/subscription.repository.interface.ts';
import type { IGithubService } from '../../common/interfaces/services/github.service.interface.ts';

interface ILogger {
  info(data: unknown): void;
}

export interface SubscriptionServiceDeps {
  githubService: IGithubService;
  subscriptionRepository: ISubscriptionRepository;
  notifier: Notifier;
  log: ILogger;
}

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: ReturnType<typeof createSubscriptionService>;
  }
}

export function createSubscriptionService(deps: SubscriptionServiceDeps) {
  const { githubService, subscriptionRepository, notifier, log } = deps;

  return {
    async subscribe(email: string, repoFullName: string) {
      const ghRepo = await githubService.ensureRepoExists(repoFullName);
      let subscription;
      try {
        subscription = await subscriptionRepository.create({
          email,
          repositoryId: ghRepo.id,
        });
      } catch (error) {
        if (error instanceof AlreadyExistsError)
          throw new ConflictError(
            'Email already subscribed to this repository',
          );
        throw error;
      }
      log.info(subscription);
      await notifier.sendConfirmationEmail(
        email,
        repoFullName,
        subscription.confirmToken,
        subscription.unsubToken,
      );
    },

    async confirmSubscription(token: string) {
      const subscription =
        await subscriptionRepository.findByConfirmToken(token);
      if (!subscription) throw new NotFoundError('Token not found');
      await subscriptionRepository.updateById(subscription.id, {
        status: 'confirmed',
      });
    },

    async unsubscribe(token: string) {
      const subscription = await subscriptionRepository.findByUnsubToken(token);
      if (!subscription) throw new NotFoundError('Token not found');
      await subscriptionRepository.delete(subscription.id);
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
        notifier: fastify.mailService,
        log: fastify.log,
      }),
    );
    done();
  },
  {
    name: 'subscriptionService',
    dependencies: ['ghRepoRepository', 'githubService', 'mailService'],
  },
);
