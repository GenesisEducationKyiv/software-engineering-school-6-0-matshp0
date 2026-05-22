import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  AlreadyExistsError,
  NotFoundError,
} from '../../common/errors/index.ts';
import type { IGhRepoRepository } from '../../common/interfaces/repositories/gh-repo.repository.interface.ts';
import type { IGithubService } from '../../common/interfaces/services/github.service.interface.ts';

interface IOctokit {
  repos: {
    get(params: { owner: string; repo: string }): Promise<unknown>;
    getLatestRelease(params: { owner: string; repo: string }): Promise<{
      data: { tag_name: string };
      headers: { etag?: string | null };
    }>;
  };
}

interface ILogger {
  info(data: unknown): void;
}

export interface GithubServiceDeps {
  octokit: IOctokit;
  ghRepoRepository: IGhRepoRepository;
  log: ILogger;
}

declare module 'fastify' {
  interface FastifyInstance {
    githubService: IGithubService;
  }
}

export function createGithubService(deps: GithubServiceDeps): IGithubService {
  const { octokit, ghRepoRepository, log } = deps;

  async function validateRepo(owner: string, repo: string) {
    try {
      await octokit.repos.get({ owner, repo });
      return { exists: true as const };
    } catch (error) {
      if ((error as { status?: number }).status === 404)
        return { exists: false as const };
      throw error;
    }
  }

  async function fetchLatestRelease(owner: string, repo: string) {
    try {
      const response = await octokit.repos.getLatestRelease({ owner, repo });
      log.info(response);
      return {
        lastSeenTag: response.data.tag_name,
        etag: response.headers.etag ?? null,
      };
    } catch (error) {
      if ((error as { status?: number }).status === 404)
        return { lastSeenTag: null, etag: null };
      throw error;
    }
  }

  return {
    async ensureRepoExists(fullName: string) {
      const existing = await ghRepoRepository.findByFullName(fullName);
      if (existing) return existing;

      const [owner, name] = fullName.split('/');
      const { exists } = await validateRepo(owner, name);
      if (!exists) throw new NotFoundError('Repository not found on GitHub');

      const { lastSeenTag, etag } = await fetchLatestRelease(owner, name);
      log.info({ lastSeenTag, etag });

      try {
        return await ghRepoRepository.create({ fullName, lastSeenTag, etag });
      } catch (error) {
        if (!(error instanceof AlreadyExistsError)) throw error;
        const repo = await ghRepoRepository.findByFullName(fullName);
        if (!repo)
          throw new Error('Repository disappeared after concurrent insert');
        return repo;
      }
    },
  };
}

export default fp(
  function (fastify: FastifyInstance, _opts: object, done: () => void) {
    fastify.decorate(
      'githubService',
      createGithubService({
        octokit: fastify.octokit,
        ghRepoRepository: fastify.ghRepoRepository,
        log: fastify.log,
      }),
    );
    done();
  },
  {
    name: 'githubService',
    dependencies: ['ghRepoRepository', 'octokit'],
  },
);
