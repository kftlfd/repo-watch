import type { FastifyPluginCallback } from 'fastify';

import { mapErrorToHttp } from '@/utils/errors.js';

import {
  confirm,
  listSubscriptions,
  subscribe,
  SubscribeSchema,
  unsubscribe,
} from './subscription.service.js';

export const subscriptionRoutes: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.post('/subscribe', async (req, reply) => {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (parsed.success) {
      const result = await subscribe(parsed.data);
      return result.match(
        () =>
          reply.code(200).send({ message: 'Subscription successful. Confirmation email sent.' }),
        (error) => reply.code(mapErrorToHttp(error)).send(error),
      );
    }
    return reply.code(400).send({ message: 'Invalid input' });
  });

  fastify.get<{ Params: { token: string } }>('/confirm/:token', async (req, reply) => {
    const { token } = req.params;
    const result = await confirm(token);
    return result.match(
      () => reply.code(200).send({ message: 'Subscription confirmed successfully.' }),
      (error) => reply.code(mapErrorToHttp(error)).send(error),
    );
  });

  fastify.get<{ Params: { token: string } }>('/unsubscribe/:token', async (req, reply) => {
    const { token } = req.params;
    const result = await unsubscribe(token);
    return result.match(
      () => reply.code(200).send({ message: 'Unsubscribed successfully.' }),
      (error) => reply.code(mapErrorToHttp(error)).send(error),
    );
  });

  fastify.get<{ Querystring: { email?: string } }>('/subscriptions', async (req, reply) => {
    const email = req.query.email;
    if (!email) {
      return reply.code(400).send({ message: 'Email parameter is required' });
    }
    const result = await listSubscriptions(email);
    return result.match(
      (subscriptions) => reply.code(200).send(subscriptions),
      (error) => reply.code(mapErrorToHttp(error)).send(error),
    );
  });

  done();
};
