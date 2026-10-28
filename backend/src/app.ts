import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import * as argon2 from 'argon2';
import { prisma } from './core/database/prisma.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { repairRoutes } from './modules/repair/repair.routes.js';
import { posRoutes } from './modules/pos/pos.routes.js';
import { accountingRoutes } from './modules/accounting/accounting.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(jwt, { secret: process.env.JWT_ACCESS_SECRET || 'nexus-default-jwt-secret' });

  // Register All Domain Subsystems
  await app.register(inventoryRoutes, { prefix: '/api/v1/inventory' });
  await app.register(repairRoutes, { prefix: '/api/v1/repairs' });
  await app.register(posRoutes, { prefix: '/api/v1/pos' });
  await app.register(accountingRoutes, { prefix: '/api/v1/accounting' });

  // Gateway Heartbeat
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // Authentication Entrypoint
  app.post('/api/v1/auth/login', async (request, reply) => {
    const LoginSchema = z.object({
      username: z.string(),
      password: z.string(),
    });

    const { username, password } = LoginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      return reply.status(401).send({ success: false, message: 'Invalid credentials or inactive account.' });
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      return reply.status(401).send({ success: false, message: 'Invalid credentials.' });
    }

    const token = app.jwt.sign({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    };
  });

  return app;
}
