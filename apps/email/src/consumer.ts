import * as amqp from 'amqplib';
import {
  EMAIL_QUEUE,
  NOTIFICATIONS_EXCHANGE,
  RoutingKey,
  type ConfirmationEmailEvent,
  type ReleaseEmailEvent,
} from '@github-notifier/contracts';
import type { Mailer } from './mailer.js';
import type { Logger } from './logger.js';
import { buildConfirmationEmail, buildReleaseEmail } from './templates.js';

const PREFETCH = 5;

export interface ConsumerDeps {
  url: string;
  mailer: Mailer;
  appUrl: string;
  log: Logger;
}

export interface Consumer {
  close(): Promise<void>;
}

export async function startConsumer(deps: ConsumerDeps): Promise<Consumer> {
  const { url, mailer, appUrl, log } = deps;

  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();

  await channel.assertExchange(NOTIFICATIONS_EXCHANGE, 'topic', {
    durable: true,
  });
  await channel.assertQueue(EMAIL_QUEUE, { durable: true });
  await channel.bindQueue(
    EMAIL_QUEUE,
    NOTIFICATIONS_EXCHANGE,
    RoutingKey.ConfirmationEmail,
  );
  await channel.bindQueue(
    EMAIL_QUEUE,
    NOTIFICATIONS_EXCHANGE,
    RoutingKey.ReleaseEmail,
  );
  await channel.prefetch(PREFETCH);

  async function handle(message: amqp.ConsumeMessage): Promise<void> {
    const { routingKey } = message.fields;
    const payload = JSON.parse(message.content.toString()) as unknown;

    if (routingKey === RoutingKey.ConfirmationEmail) {
      const event = payload as ConfirmationEmailEvent;
      await mailer.sendMail(buildConfirmationEmail(event, appUrl));
      log.info(
        { to: event.email, repo: event.repoFullName },
        'Sent confirmation email',
      );
    } else if (routingKey === RoutingKey.ReleaseEmail) {
      const event = payload as ReleaseEmailEvent;
      await mailer.sendMail(buildReleaseEmail(event, appUrl));
      log.info(
        { to: event.email, repo: event.repoFullName, tag: event.tagName },
        'Sent release notification email',
      );
    } else {
      log.warn({ routingKey }, 'Unknown routing key, discarding message');
    }
  }

  await channel.consume(EMAIL_QUEUE, (message) => {
    if (!message) return;
    void handle(message)
      .then(() => channel.ack(message))
      .catch((err: unknown) => {
        log.error(
          { err, routingKey: message.fields.routingKey },
          'Failed to process message, discarding',
        );
        channel.nack(message, false, false);
      });
  });

  log.info({ queue: EMAIL_QUEUE }, 'Email consumer ready');

  return {
    async close() {
      await channel.close();
      await connection.close();
    },
  };
}
