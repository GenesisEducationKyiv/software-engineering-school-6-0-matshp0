import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  RoutingKey,
  type ConfirmationEmailEvent,
  type ReleaseEmailEvent,
} from '@github-notifier/contracts';
import type { Notifier } from '../../common/notifier.js';
import type { ILogger } from '../../common/interfaces/logger.interface.js';
import type { Publisher } from '../infrastructure/rabbitmq.js';

export interface NotifierDeps {
  publisher: Publisher;
  log: ILogger;
}

declare module 'fastify' {
  interface FastifyInstance {
    notifier: Notifier;
  }
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const { publisher, log } = deps;

  return {
    sendConfirmationEmail(params) {
      const event: ConfirmationEmailEvent = params;
      log.info(
        { to: params.email, repo: params.repoFullName },
        'Publishing confirmation email event',
      );
      return publisher.publish(RoutingKey.ConfirmationEmail, event);
    },

    sendReleaseNotification(params) {
      const event: ReleaseEmailEvent = params;
      log.info(
        { to: params.email, repo: params.repoFullName, tag: params.tagName },
        'Publishing release notification event',
      );
      return publisher.publish(RoutingKey.ReleaseEmail, event);
    },
  };
}

export default fp(
  (fastify: FastifyInstance, _opts: object, done: () => void) => {
    fastify.decorate(
      'notifier',
      createNotifier({ publisher: fastify.publisher, log: fastify.log }),
    );
    done();
  },
  {
    name: 'notifier',
    dependencies: ['publisher'],
  },
);
