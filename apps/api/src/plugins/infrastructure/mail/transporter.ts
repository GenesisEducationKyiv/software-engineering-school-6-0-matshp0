import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import nodemailer from 'nodemailer';

const QUEUE_CONCURRENCY = 5;

interface MailJob {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

interface QueueItem {
  job: MailJob;
  resolve: () => void;
  reject: (err: unknown) => void;
}

interface Mailer {
  sendMail: (job: MailJob) => Promise<void>;
  drain: () => Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
  }
}

export function createMailer(
  transporter: nodemailer.Transporter,
  log: FastifyInstance['log'],
): Mailer {
  let active = 0;
  const queue: QueueItem[] = [];
  let drainResolve: (() => void) | null = null;

  function processNext() {
    if (active >= QUEUE_CONCURRENCY || queue.length === 0) return;

    const item = queue.shift()!;
    active++;

    transporter
      .sendMail(item.job)
      .then(() => item.resolve())
      .catch((err: unknown) => {
        log.error({ err }, 'Failed to send email');
        item.reject(err);
      })
      .finally(() => {
        active--;
        processNext();
        if (active === 0 && queue.length === 0 && drainResolve) {
          drainResolve();
          drainResolve = null;
        }
      });
  }

  function sendMail(job: MailJob) {
    return new Promise<void>((resolve, reject) => {
      queue.push({ job, resolve, reject });
      processNext();
    });
  }

  function drain() {
    if (active === 0 && queue.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      drainResolve = resolve;
    });
  }

  return { sendMail, drain };
}

export default fp(
  (fastify: FastifyInstance, _opts: object, done: () => void) => {
    const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = fastify.config;

    const transporter = nodemailer.createTransport({
      host: MAIL_HOST,
      port: MAIL_PORT,
      auth: MAIL_USER ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
    });

    const mailer = createMailer(transporter, fastify.log);
    fastify.decorate('mailer', mailer);

    fastify.addHook('onClose', async () => {
      await mailer.drain();
      transporter.close();
    });

    done();
  },
  { name: 'mailer' },
);
