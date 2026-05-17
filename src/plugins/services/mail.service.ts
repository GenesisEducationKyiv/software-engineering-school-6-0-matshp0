import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Notifier } from '../../common/notifier.js';

interface MailJob {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

interface IMailer {
  sendMail(job: MailJob): Promise<void>;
}

interface IConfig {
  APP_URL: string;
}

export interface MailServiceDeps {
  mailer: IMailer;
  config: IConfig;
}

declare module 'fastify' {
  interface FastifyInstance {
    mailService: Notifier;
  }
}

export function createMailService(deps: MailServiceDeps): Notifier {
  const { mailer, config } = deps;

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
    fastify.decorate(
      'mailService',
      createMailService({
        mailer: fastify.mailer,
        config: fastify.config,
      }),
    );
    done();
  },
  {
    name: 'mailService',
    dependencies: ['mailer'],
  },
);
