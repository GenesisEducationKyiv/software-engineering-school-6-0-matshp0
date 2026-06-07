import { Octokit } from '@octokit/rest';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  export interface FastifyInstance {
    octokit: Octokit;
  }
}

export const getOctokit = (fastify: FastifyInstance) => {
  const octokit = new Octokit({
    auth: fastify.config.GITHUB_TOKEN,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  });
  return octokit;
};

export default fp(
  (fastify: FastifyInstance, _opts: object, done: () => void) => {
    fastify.decorate('octokit', getOctokit(fastify));
    done();
  },
  { name: 'octokit' },
);
