import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { AlreadyExistsError } from '../../common/errors/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    subscriptionService: ReturnType<typeof createSubscriptionService>;
  }
}

export function createSubscriptionService(fastify: FastifyInstance) {
  const {
    githubService,
    subscriptionRepository,
    httpErrors,
    mailService,
    log,
  } = fastify;
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
          throw httpErrors.conflict(
            'Email already subscribed to this repository',
          );
        throw error;
      }
      log.info(subscription);
      await mailService.sendConfirmationEmail(
        email,
        repoFullName,
        subscription.confirmToken,
        subscription.unsubToken,
      );
    },

    async confirmSubscription(token: string) {
      const subscription =
        await subscriptionRepository.findByConfirmToken(token);
      if (!subscription) throw httpErrors.notFound('Token not found');
      await subscriptionRepository.updateById(subscription.id, {
        status: 'confirmed',
      });
    },

    async unsubscribe(token: string) {
      const subscription = await subscriptionRepository.findByUnsubToken(token);
      if (!subscription) throw httpErrors.notFound('Token not found');
      await subscriptionRepository.delete(subscription.id);
    },

    async getSubscriptionsByEmail(email: string) {
      const subscriptions = await subscriptionRepository.findAllByEmail(email);
      const filtered = subscriptions.filter((s) => s.status === 'confirmed');
      return filtered.map((s) => ({
        id: s.id,
        email: s.email,
        repository: s.repository,
      }));
    },
  };
}

export default fp(
  (fastify, _opts, done) => {
    fastify.decorate('subscriptionService', createSubscriptionService(fastify));
    done();
  },
  {
    name: 'subscriptionService',
    dependencies: ['ghRepoRepository', 'githubService', 'mailService'],
  },
);
