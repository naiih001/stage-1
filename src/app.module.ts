import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ProfilesModule } from './profiles/profiles.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { VersionHeaderMiddleware } from './common/middleware/version-header.middleware';
import { NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';

const isAuthRoute = (context: ExecutionContext): boolean => {
  const request = context.switchToHttp().getRequest<Request>();
  const path = (request.originalUrl ?? request.url ?? '').split('?')[0];

  return (
    path === '/auth' ||
    path.startsWith('/auth/') ||
    path === '/api/auth' ||
    path.startsWith('/api/auth/')
  );
};

const getUserAwareTracker = (request: Request): string => {
  const authHeader = request.headers.authorization;
  const token =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

  if (token) {
    const [, payload] = token.split('.');

    try {
      const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(
        Buffer.from(normalizedPayload, 'base64').toString('utf8'),
      ) as { sub?: unknown };

      if (typeof decoded.sub === 'string' && decoded.sub.length > 0) {
        return `user:${decoded.sub}`;
      }
    } catch {
      // Fall back to IP-based tracking for malformed or non-JWT bearer values.
    }
  }

  return `ip:${request.ip}`;
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'standard',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'test' ? 1000 : 60,
        skipIf: isAuthRoute,
        getTracker: getUserAwareTracker,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
        skipIf: (context) => !isAuthRoute(context),
      },
    ]),
    HttpModule,
    PrismaModule,
    ProfilesModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(VersionHeaderMiddleware)
      .forRoutes(
        { path: 'profiles', method: RequestMethod.ALL },
        { path: 'profiles/(.*)', method: RequestMethod.ALL },
      );
  }
}
