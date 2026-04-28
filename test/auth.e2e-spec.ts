import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { uuidv7 } from 'uuidv7';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({
            JWT_ACCESS_SECRET: 'test-secret',
            JWT_REFRESH_SECRET: 'test-refresh-secret',
            GITHUB_CLIENT_ID: 'test-client-id',
            GITHUB_CLIENT_SECRET: 'test-client-secret',
            GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
          })],
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens given a valid refresh token', async () => {
      // 1. Create a user
      const user = await prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: '12345',
          username: 'testuser',
        },
      });

      // 2. Create a refresh token
      const refreshTokenString = uuidv7();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);

      await prisma.refreshToken.create({
        data: {
          id: uuidv7(),
          token: refreshTokenString,
          userId: user.id,
          expiresAt,
        },
      });

      // 3. Request refresh
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshTokenString })
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.refresh_token).not.toBe(refreshTokenString);

      // 4. Verify old token is gone
      const oldToken = await prisma.refreshToken.findUnique({
        where: { token: refreshTokenString },
      });
      expect(oldToken).toBeNull();
    });

    it('should fail with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: 'invalid' })
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should revoke a refresh token', async () => {
      // 1. Create user and token
      const user = await prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: '12345',
          username: 'testuser',
        },
      });

      const refreshTokenString = uuidv7();
      await prisma.refreshToken.create({
        data: {
          id: uuidv7(),
          token: refreshTokenString,
          userId: user.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      // 2. Logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refresh_token: refreshTokenString })
        .expect(201);

      // 3. Verify token is gone
      const token = await prisma.refreshToken.findUnique({
        where: { token: refreshTokenString },
      });
      expect(token).toBeNull();
    });
  });
});
