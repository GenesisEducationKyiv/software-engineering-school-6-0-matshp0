import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { AlreadyExistsError } from '../../common/errors/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    githubService: ReturnType<typeof createGithubService>;
  }
}

export function createGithubService(fastify: FastifyInstance) {
  const { octokit, ghRepoRepository, httpErrors, log } = fastify;

  async function validateRepo(owner: string, repo: string) {
    try {
      const { data } = await octokit.repos.get({ owner, repo });
      return { exists: true, data };
    } catch (error: any) {
      if (error.status === 404) return { exists: false as const };
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
    } catch (error: any) {
      if (error.status === 404) return { lastSeenTag: null, etag: null };
      throw error;
    }
  }

  return {
    async ensureRepoExists(fullName: string) {
      const existing = await ghRepoRepository.findByFullName(fullName);
      if (existing) return existing;

      const [owner, name] = fullName.split('/');
      const { exists } = await validateRepo(owner, name);
      if (!exists) throw httpErrors.notFound('Repository not found on GitHub');

      const { lastSeenTag, etag } = await fetchLatestRelease(owner, name);
      log.info({ lastSeenTag, etag });

      try {
        return await ghRepoRepository.create({ fullName, lastSeenTag, etag });
      } catch (error) {
        if (!(error instanceof AlreadyExistsError)) throw error;
        const repo = await ghRepoRepository.findByFullName(fullName);
        if (!repo) throw httpErrors.internalServerError();
        return repo;
      }
    },
  };
}

export default fp(
  async function (fastify: FastifyInstance) {
    fastify.decorate('githubService', createGithubService(fastify));
  },
  {
    name: 'githubService',
    dependencies: ['ghRepoRepository', 'octokit'],
  },
);
