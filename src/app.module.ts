import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ProfilesModule } from './profiles/profiles.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { VersionHeaderMiddleware } from './common/middleware/version-header.middleware';
import { NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
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
