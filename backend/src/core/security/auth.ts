import { FastifyRequest, FastifyReply } from 'fastify';
import { Role } from '@prisma/client';

export interface TokenPayload {
  userId: string;
  username: string;
  role: Role;
}

export function authorizeRoles(allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const user = request.user as TokenPayload;
      if (!allowedRoles.includes(user.role)) {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden',
          message: 'Insufficient access privileges for this operation.',
        });
      }
    } catch (err) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or expired session token.',
      });
    }
  };
}
