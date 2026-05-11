import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSubscriptionService } from '../../../src/modules/subscription/subscription.service.js';
import { AlreadyExistsError } from '../../../src/common/errors/index.js';
import type { FastifyInstance } from 'fastify';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildHttpErrors() {
  return {
    conflict: (msg: string) =>
      Object.assign(new Error(msg), { statusCode: 409 }),
    notFound: (msg: string) =>
      Object.assign(new Error(msg), { statusCode: 404 }),
    internalServerError: () =>
      Object.assign(new Error('Internal Server Error'), { statusCode: 500 }),
  };
}

function buildMockFastify() {
  return {
    githubService: { ensureRepoExists: vi.fn() },
    subscriptionRepository: {
      create: vi.fn(),
      updateById: vi.fn(),
      findByConfirmToken: vi.fn(),
      findByUnsubToken: vi.fn(),
      findAllByEmail: vi.fn(),
      delete: vi.fn(),
    },
    mailService: {
      sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    },
    httpErrors: buildHttpErrors(),
    log: { info: vi.fn() },
  };
}

function buildRepo(overrides = {}) {
  return { id: 'repo-1', fullName: 'owner/repo', ...overrides };
}

function buildSubscription(overrides = {}) {
  return {
    id: 'sub-1',
    email: 'user@test.com',
    repositoryId: 'repo-1',
    status: 'pending' as const,
    confirmToken: 'confirm-tok',
    unsubToken: 'unsub-tok',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createSubscriptionService', () => {
  let fastify: ReturnType<typeof buildMockFastify>;
  let service: ReturnType<typeof createSubscriptionService>;

  beforeEach(() => {
    vi.clearAllMocks();
    fastify = buildMockFastify();
    service = createSubscriptionService(fastify as unknown as FastifyInstance);
  });

  describe('subscribe()', () => {
    it('ensures the repo exists, creates a subscription and sends confirmation email', async () => {
      const repo = buildRepo();
      const subscription = buildSubscription();
      fastify.githubService.ensureRepoExists.mockResolvedValue(repo);
      fastify.subscriptionRepository.create.mockResolvedValue(subscription);

      await service.subscribe('user@test.com', 'owner/repo');

      expect(fastify.githubService.ensureRepoExists).toHaveBeenCalledWith(
        'owner/repo',
      );
      expect(fastify.subscriptionRepository.create).toHaveBeenCalledWith({
        email: 'user@test.com',
        repositoryId: repo.id,
      });
      expect(fastify.mailService.sendConfirmationEmail).toHaveBeenCalledWith(
        'user@test.com',
        'owner/repo',
        subscription.confirmToken,
        subscription.unsubToken,
      );
    });

    it('throws conflict when email is already subscribed to the repository', async () => {
      fastify.githubService.ensureRepoExists.mockResolvedValue(buildRepo());
      fastify.subscriptionRepository.create.mockRejectedValue(
        new AlreadyExistsError(),
      );

      await expect(
        service.subscribe('user@test.com', 'owner/repo'),
      ).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(fastify.mailService.sendConfirmationEmail).not.toHaveBeenCalled();
    });
  });

  describe('confirmSubscription()', () => {
    it('sets status to confirmed for a valid token', async () => {
      const subscription = buildSubscription();
      fastify.subscriptionRepository.findByConfirmToken.mockResolvedValue(
        subscription,
      );

      await service.confirmSubscription('confirm-tok');

      expect(fastify.subscriptionRepository.updateById).toHaveBeenCalledWith(
        subscription.id,
        { status: 'confirmed' },
      );
    });

    it('throws 404 when confirm token is not found', async () => {
      fastify.subscriptionRepository.findByConfirmToken.mockResolvedValue(null);

      await expect(
        service.confirmSubscription('bad-token'),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('unsubscribe()', () => {
    it('deletes the subscription for a valid unsub token', async () => {
      const subscription = buildSubscription({ status: 'confirmed' });
      fastify.subscriptionRepository.findByUnsubToken.mockResolvedValue(
        subscription,
      );

      await service.unsubscribe('unsub-tok');

      expect(fastify.subscriptionRepository.delete).toHaveBeenCalledWith(
        subscription.id,
      );
    });

    it('throws 404 when unsub token is not found', async () => {
      fastify.subscriptionRepository.findByUnsubToken.mockResolvedValue(null);

      await expect(service.unsubscribe('bad-token')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('getSubscriptionsByEmail()', () => {
    it('queries the repository with a confirmed-status filter and maps the result to id, email, repository', async () => {
      fastify.subscriptionRepository.findAllByEmail.mockResolvedValue([
        {
          id: 's1',
          email: 'user@test.com',
          status: 'confirmed',
          repository: 'owner/repo',
        },
      ]);

      const result = await service.getSubscriptionsByEmail('user@test.com');

      expect(
        fastify.subscriptionRepository.findAllByEmail,
      ).toHaveBeenCalledWith('user@test.com', { status: 'confirmed' });
      expect(result).toEqual([
        { id: 's1', email: 'user@test.com', repository: 'owner/repo' },
      ]);
    });

    it('returns empty array when there are no confirmed subscriptions', async () => {
      fastify.subscriptionRepository.findAllByEmail.mockResolvedValue([]);

      const result = await service.getSubscriptionsByEmail('user@test.com');

      expect(result).toEqual([]);
    });
  });
});
