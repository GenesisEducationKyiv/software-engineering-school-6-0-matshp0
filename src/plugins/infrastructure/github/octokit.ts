import { Octokit } from '@octokit/rest';
import { FastifyInstance } from 'fastify';
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
  async (fastify: FastifyInstance) => {
    fastify.decorate('octokit', getOctokit(fastify));
  },
  { name: 'octokit' },
);
