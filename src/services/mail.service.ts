import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    mailService: ReturnType<typeof createMailService>;
  }
}

function createMailService(fastify: FastifyInstance) {
  const { mailer, config } = fastify;

  return {
    sendConfirmationEmail(
      email: string,
      repoFullName: string,
      confirmToken: string,
      unsubToken: string,
    ) {
      const confirmUrl = `${config.APP_URL}/api/confirm/${confirmToken}`;
      const unsubUrl = `${config.APP_URL}/api/unsubscribe/${unsubToken}`;
      return mailer.sendMail({
        from: 'GitHub Notifier <noreply@github-notifier.local>',
        to: email,
        subject: `Confirm your subscription to ${repoFullName}`,
        text: `Click the link to confirm your subscription:\n\n${confirmUrl}\n\nUnsubscribe: ${unsubUrl}`,
        html: `<p>Click the link to confirm your subscription to <strong>${repoFullName}</strong>:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p><p><a href="${unsubUrl}">Unsubscribe</a></p>`,
      });
    },

    sendReleaseNotification(
      email: string,
      repoFullName: string,
      tagName: string,
      unsubToken: string,
    ) {
      const releaseUrl = `https://github.com/${repoFullName}/releases/tag/${tagName}`;
      const unsubUrl = `${config.APP_URL}/api/unsubscribe/${unsubToken}`;
      return mailer.sendMail({
        from: 'GitHub Notifier <noreply@github-notifier.local>',
        to: email,
        subject: `New release: ${repoFullName} ${tagName}`,
        text: `${repoFullName} released ${tagName}.\n\nView release: ${releaseUrl}\n\nUnsubscribe: ${unsubUrl}`,
        html: `<p><strong>${repoFullName}</strong> released <strong>${tagName}</strong>.</p><p><a href="${releaseUrl}">View release</a></p><p><a href="${unsubUrl}">Unsubscribe</a></p>`,
      });
    },
  };
}

export default fp(
  (fastify: FastifyInstance, _opts: object, done: () => void) => {
    fastify.decorate('mailService', createMailService(fastify));
    done();
  },
  {
    name: 'mailService',
    dependencies: ['mailer'],
  },
);
