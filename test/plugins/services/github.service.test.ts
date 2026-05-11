import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createGithubService,
  GithubServiceDeps,
} from '../../../src/plugins/services/github.service.js';
import { AlreadyExistsError } from '../../../src/common/errors/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockDeps() {
  return {
    octokit: {
      repos: {
        get: vi.fn(),
        getLatestRelease: vi.fn(),
      },
    },
    ghRepoRepository: {
      findByFullName: vi.fn(),
      create: vi.fn(),
    },
    httpErrors: {
      notFound: (msg: string) =>
        Object.assign(new Error(msg), { statusCode: 404 }),
      internalServerError: () =>
        Object.assign(new Error('Internal Server Error'), { statusCode: 500 }),
    },
    log: { info: vi.fn() },
  };
}

function buildRepo(overrides = {}) {
  return {
    id: 'repo-1',
    fullName: 'owner/repo',
    lastSeenTag: 'v1.0.0',
    etag: '"etag-abc"',
    lastCheckedAt: new Date(),
    ...overrides,
  };
}

function buildApiError(status: number) {
  return Object.assign(new Error('GitHub API error'), { status });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createGithubService', () => {
  let deps: ReturnType<typeof buildMockDeps>;
  let service: ReturnType<typeof createGithubService>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildMockDeps();
    service = createGithubService(deps as GithubServiceDeps);
  });

  describe('ensureRepoExists()', () => {
    it('returns the existing repo from DB without calling GitHub', async () => {
      const repo = buildRepo();
      deps.ghRepoRepository.findByFullName.mockResolvedValue(repo);

      const result = await service.ensureRepoExists('owner/repo');

      expect(result).toBe(repo);
      expect(deps.octokit.repos.get).not.toHaveBeenCalled();
    });

    it('throws 404 when repository does not exist on GitHub', async () => {
      deps.ghRepoRepository.findByFullName.mockResolvedValue(null);
      deps.octokit.repos.get.mockRejectedValue(buildApiError(404));

      await expect(
        service.ensureRepoExists('owner/repo'),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(deps.ghRepoRepository.create).not.toHaveBeenCalled();
    });

    it('creates and returns a new repo when it exists on GitHub but not in DB', async () => {
      const created = buildRepo();
      deps.ghRepoRepository.findByFullName.mockResolvedValue(null);
      deps.octokit.repos.get.mockResolvedValue({ data: {} });
      deps.octokit.repos.getLatestRelease.mockResolvedValue({
        data: { tag_name: 'v1.0.0' },
        headers: { etag: '"etag-abc"' },
      });
      deps.ghRepoRepository.create.mockResolvedValue(created);

      const result = await service.ensureRepoExists('owner/repo');

      expect(deps.ghRepoRepository.create).toHaveBeenCalledWith({
        fullName: 'owner/repo',
        lastSeenTag: 'v1.0.0',
        etag: '"etag-abc"',
      });
      expect(result).toBe(created);
    });

    it('stores null tag and etag when repo has no releases', async () => {
      deps.ghRepoRepository.findByFullName.mockResolvedValue(null);
      deps.octokit.repos.get.mockResolvedValue({ data: {} });
      deps.octokit.repos.getLatestRelease.mockRejectedValue(buildApiError(404));
      deps.ghRepoRepository.create.mockResolvedValue(
        buildRepo({ lastSeenTag: null, etag: null }),
      );

      await service.ensureRepoExists('owner/repo');

      expect(deps.ghRepoRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ lastSeenTag: null, etag: null }),
      );
    });

    it('returns the existing DB record on a concurrent creation race (AlreadyExistsError)', async () => {
      const existing = buildRepo();
      deps.ghRepoRepository.findByFullName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);
      deps.octokit.repos.get.mockResolvedValue({ data: {} });
      deps.octokit.repos.getLatestRelease.mockResolvedValue({
        data: { tag_name: 'v1.0.0' },
        headers: { etag: null },
      });
      deps.ghRepoRepository.create.mockRejectedValue(new AlreadyExistsError());

      const result = await service.ensureRepoExists('owner/repo');

      expect(result).toBe(existing);
    });

    it('rethrows unexpected GitHub API errors', async () => {
      deps.ghRepoRepository.findByFullName.mockResolvedValue(null);
      deps.octokit.repos.get.mockRejectedValue(buildApiError(500));

      await expect(
        service.ensureRepoExists('owner/repo'),
      ).rejects.toMatchObject({
        status: 500,
      });
    });
  });
});
