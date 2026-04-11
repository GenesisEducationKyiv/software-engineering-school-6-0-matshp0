import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScannerService } from '../../../src/modules/scanner/scanner.service.js';
import type { FastifyInstance } from 'fastify';
import type { Selectable } from 'kysely';
import type { Repositories } from '../../../src/plugins/infrastructure/database/types.js';

function buildMockFastify() {
  return {
    ghRepoRepository: {
      findAll: vi.fn().mockResolvedValue([]),
      updateById: vi.fn().mockResolvedValue(undefined),
    },
    subscriptionRepository: {
      findConfirmedByRepositoryId: vi.fn().mockResolvedValue([]),
    },
    mailService: {
      sendReleaseNotification: vi.fn().mockResolvedValue(undefined),
    },
    octokit: { request: vi.fn() },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

function buildRepo(
  overrides: Partial<Selectable<Repositories>> = {},
): Selectable<Repositories> {
  return {
    id: 'repo-1',
    fullName: 'owner/repo',
    lastSeenTag: 'v1.0.0',
    etag: '"etag-abc"',
    lastCheckedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function buildSubscriber(overrides = {}) {
  return {
    id: 'sub-1',
    email: 'user@example.com',
    repositoryId: 'repo-1',
    status: 'confirmed' as const,
    confirmToken: 'confirm-token',
    unsubToken: 'unsub-token',
    ...overrides,
  };
}

function buildReleaseResponse(tagName: string, etag = '"etag-new"') {
  return {
    data: { tag_name: tagName },
    headers: { etag },
    status: 200,
  };
}

function buildApiError(status: number, headers: Record<string, string> = {}) {
  const error = new Error('GitHub API error') as any;
  error.status = status;
  error.response = { headers };
  return error;
}

describe('createScannerService', () => {
  let fastify: ReturnType<typeof buildMockFastify>;
  let scanner: ReturnType<typeof createScannerService>;

  beforeEach(() => {
    vi.clearAllMocks();
    fastify = buildMockFastify();
    scanner = createScannerService(fastify as unknown as FastifyInstance);
  });

  describe('scan()', () => {
    it('does nothing when there are no repositories', async () => {
      fastify.ghRepoRepository.findAll.mockResolvedValue([]);

      await scanner.scan();

      expect(fastify.octokit.request).not.toHaveBeenCalled();
    });

    it('calls octokit for each repository', async () => {
      const repos = [
        buildRepo({ id: 'r1', fullName: 'a/b' }),
        buildRepo({ id: 'r2', fullName: 'c/d' }),
      ];
      fastify.ghRepoRepository.findAll.mockResolvedValue(repos);
      fastify.octokit.request.mockResolvedValue(buildReleaseResponse('v1.0.0'));

      await scanner.scan();

      expect(fastify.octokit.request).toHaveBeenCalledTimes(2);
    });

    it('stops processing repos after a 429', async () => {
      const repos = [
        buildRepo({ id: 'r1', fullName: 'a/b' }),
        buildRepo({ id: 'r2', fullName: 'c/d' }),
        buildRepo({ id: 'r3', fullName: 'e/f' }),
      ];
      fastify.ghRepoRepository.findAll.mockResolvedValue(repos);
      fastify.octokit.request
        .mockRejectedValueOnce(buildApiError(429, { 'retry-after': '60' }))
        .mockResolvedValue(buildReleaseResponse('v1.0.0'));

      await scanner.scan();

      expect(fastify.octokit.request).toHaveBeenCalledTimes(1);
    });

    it('skips scan when rate limited from a previous scan', async () => {
      const repo = buildRepo();
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockRejectedValue(
        buildApiError(429, { 'retry-after': '60' }),
      );

      await scanner.scan();
      await scanner.scan();

      expect(fastify.ghRepoRepository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('new release', () => {
    it('updates the repository with the new tag and etag', async () => {
      const repo = buildRepo({ lastSeenTag: 'v1.0.0' });
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockResolvedValue(
        buildReleaseResponse('v2.0.0', '"etag-new"'),
      );

      await scanner.scan();

      expect(fastify.ghRepoRepository.updateById).toHaveBeenCalledWith(
        repo.id,
        expect.objectContaining({ lastSeenTag: 'v2.0.0', etag: '"etag-new"' }),
      );
    });

    it('notifies all confirmed subscribers', async () => {
      const repo = buildRepo({ lastSeenTag: 'v1.0.0' });
      const subscribers = [
        buildSubscriber({ email: 'a@test.com', unsubToken: 'tok-a' }),
        buildSubscriber({
          id: 'sub-2',
          email: 'b@test.com',
          unsubToken: 'tok-b',
        }),
      ];
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockResolvedValue(buildReleaseResponse('v2.0.0'));
      fastify.subscriptionRepository.findConfirmedByRepositoryId.mockResolvedValue(
        subscribers,
      );

      await scanner.scan();

      expect(fastify.mailService.sendReleaseNotification).toHaveBeenCalledTimes(
        2,
      );
      expect(fastify.mailService.sendReleaseNotification).toHaveBeenCalledWith(
        'a@test.com',
        repo.fullName,
        'v2.0.0',
        'tok-a',
      );
      expect(fastify.mailService.sendReleaseNotification).toHaveBeenCalledWith(
        'b@test.com',
        repo.fullName,
        'v2.0.0',
        'tok-b',
      );
    });

    it('continues notifying remaining subscribers if one email fails', async () => {
      const repo = buildRepo({ lastSeenTag: 'v1.0.0' });
      const subscribers = [
        buildSubscriber({ email: 'a@test.com' }),
        buildSubscriber({ id: 'sub-2', email: 'b@test.com' }),
      ];
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockResolvedValue(buildReleaseResponse('v2.0.0'));
      fastify.subscriptionRepository.findConfirmedByRepositoryId.mockResolvedValue(
        subscribers,
      );
      fastify.mailService.sendReleaseNotification
        .mockRejectedValueOnce(new Error('SMTP error'))
        .mockResolvedValueOnce(undefined);

      await scanner.scan();

      expect(fastify.mailService.sendReleaseNotification).toHaveBeenCalledTimes(
        2,
      );
      expect(fastify.log.error).toHaveBeenCalledOnce();
    });
  });

  describe('no new release', () => {
    it('only updates etag and lastCheckedAt when tag is unchanged', async () => {
      const repo = buildRepo({ lastSeenTag: 'v1.0.0' });
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockResolvedValue(
        buildReleaseResponse('v1.0.0', '"etag-new"'),
      );

      await scanner.scan();

      expect(fastify.ghRepoRepository.updateById).toHaveBeenCalledWith(
        repo.id,
        expect.objectContaining({ etag: '"etag-new"' }),
      );
      expect(fastify.ghRepoRepository.updateById).toHaveBeenCalledWith(
        repo.id,
        expect.not.objectContaining({ lastSeenTag: expect.anything() }),
      );
      expect(
        fastify.mailService.sendReleaseNotification,
      ).not.toHaveBeenCalled();
    });

    it('updates lastCheckedAt on a 304 Not Modified', async () => {
      const repo = buildRepo({ etag: '"stored-etag"' });
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockRejectedValue(
        buildApiError(304, { etag: '"stored-etag"' }),
      );

      await scanner.scan();

      expect(fastify.ghRepoRepository.updateById).toHaveBeenCalledWith(
        repo.id,
        expect.objectContaining({ lastCheckedAt: expect.any(Date) }),
      );
      expect(
        fastify.mailService.sendReleaseNotification,
      ).not.toHaveBeenCalled();
    });

    it('treats 404 (no releases) as unchanged and updates lastCheckedAt', async () => {
      const repo = buildRepo();
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockRejectedValue(buildApiError(404));

      await scanner.scan();

      expect(fastify.ghRepoRepository.updateById).toHaveBeenCalledWith(
        repo.id,
        expect.objectContaining({ lastCheckedAt: expect.any(Date) }),
      );
      expect(
        fastify.mailService.sendReleaseNotification,
      ).not.toHaveBeenCalled();
    });
  });

  describe('rate limit (429)', () => {
    it('parses wait time from Retry-After header', async () => {
      const repo = buildRepo();
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockRejectedValue(
        buildApiError(429, { 'retry-after': '120' }),
      );

      await scanner.scan();

      expect(fastify.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ waitSeconds: 120 }),
        expect.any(String),
      );
    });

    it('parses wait time from x-ratelimit-reset header', async () => {
      const resetAt = Math.floor((Date.now() + 90_000) / 1000).toString();
      const repo = buildRepo();
      fastify.ghRepoRepository.findAll.mockResolvedValue([repo]);
      fastify.octokit.request.mockRejectedValue(
        buildApiError(429, { 'x-ratelimit-reset': resetAt }),
      );

      await scanner.scan();

      expect(fastify.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ waitSeconds: expect.any(Number) }),
        expect.any(String),
      );
    });
  });

  describe('unhandled errors', () => {
    it('logs the error and continues to the next repository', async () => {
      const repos = [
        buildRepo({ id: 'r1', fullName: 'a/b' }),
        buildRepo({ id: 'r2', fullName: 'c/d' }),
      ];
      fastify.ghRepoRepository.findAll.mockResolvedValue(repos);
      fastify.octokit.request
        .mockRejectedValueOnce(buildApiError(500))
        .mockResolvedValueOnce(buildReleaseResponse('v1.0.0'));

      await scanner.scan();

      expect(fastify.log.error).toHaveBeenCalledOnce();
      expect(fastify.octokit.request).toHaveBeenCalledTimes(2);
    });
  });
});
