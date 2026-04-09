import type { FastifyPluginCallback } from 'fastify';

import { mapErrorToHttp } from '@/utils/errors.js';

import { EmailSchema, SubscribeInputSchema } from './subscription.schema.js';
import { confirm, listSubscriptions, subscribe, unsubscribe } from './subscription.service.js';

export const subscriptionRoutes: FastifyPluginCallback = (fastify, opts, done) => {
  fastify.post('/subscribe', async (req, reply) => {
    const parsed = SubscribeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Invalid input' });
    }
    const result = await subscribe(parsed.data);
    return result.match(
      () => reply.code(200).send({ message: 'Subscription successful. Confirmation email sent.' }),
      (error) => reply.code(mapErrorToHttp(error)).send(error),
    );
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
    if (!EmailSchema.safeParse(email).success) {
      return reply.code(400).send({ message: 'Invalid email' });
    }
    const result = await listSubscriptions(email);
    return result.match(
      (subscriptions) => reply.code(200).send(subscriptions),
      (error) => reply.code(mapErrorToHttp(error)).send(error),
    );
  });

  done();
};
