import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { uuidv7 } from 'uuidv7';
import { JwtService } from '@nestjs/jwt';

describe('User Active/Login Status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'test-secret',
              JWT_REFRESH_SECRET: 'test-refresh-secret',
              GITHUB_CLIENT_ID: 'test-client-id',
              GITHUB_CLIENT_SECRET: 'test-client-secret',
              GITHUB_CALLBACK_URL:
                'http://localhost:3000/api/auth/github/callback',
            }),
          ],
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('AuthService.validateGithubUser logic via AuthController/Service', () => {
    it('should update lastLoginAt when validating user', async () => {
      const { AuthService } = require('../src/auth/auth.service');
      const authService = app.get(AuthService);

      const githubProfile = {
        id: '12345',
        username: 'testuser',
        emails: [{ value: 'test@example.com' }],
        _json: { avatar_url: 'http://avatar.com' },
      };

      const user = await authService.validateGithubUser(githubProfile);
      expect(user.lastLoginAt).toBeDefined();
      const firstLogin = user.lastLoginAt;

      // Wait a bit and validate again
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updatedUser = await authService.validateGithubUser(githubProfile);
      expect(updatedUser.lastLoginAt.getTime()).toBeGreaterThan(
        firstLogin.getTime(),
      );
    });

    it('should throw ForbiddenException if user is inactive during validation', async () => {
      const { AuthService } = require('../src/auth/auth.service');
      const authService = app.get(AuthService);

      await prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: 'inactive-123',
          username: 'inactiveuser',
          isActive: false,
        },
      });

      const githubProfile = {
        id: 'inactive-123',
        username: 'inactiveuser',
      };

      await expect(
        authService.validateGithubUser(githubProfile),
      ).rejects.toThrow('User account is deactivated');
    });
  });

  describe('JWT Strategy isActive check', () => {
    it('should allow active user with valid token', async () => {
      const user = await prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: 'active-123',
          username: 'activeuser',
          isActive: true,
        },
      });

      const token = jwtService.sign(
        { sub: user.id, username: user.username, role: user.role },
        { secret: 'test-secret' },
      );

      // Assuming there is a protected route like /api/profiles
      await request(app.getHttpServer())
        .get('/api/profiles')
        .set('Authorization', `Bearer ${token}`)
        .set('x-api-version', '1')
        .expect(200);
    });

    it('should block inactive user with valid token (403 Forbidden)', async () => {
      const user = await prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: 'blocked-123',
          username: 'blockeduser',
          isActive: false,
        },
      });

      const token = jwtService.sign(
        { sub: user.id, username: user.username, role: user.role },
        { secret: 'test-secret' },
      );

      await request(app.getHttpServer())
        .get('/api/profiles')
        .set('Authorization', `Bearer ${token}`)
        .set('x-api-version', '1')
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toBe('User account is deactivated');
        });
    });
  });

  describe('Refresh token isActive check', () => {
    it('should block inactive user from refreshing tokens', async () => {
      const { AuthService } = require('../src/auth/auth.service');
      const authService = app.get(AuthService);

      const user = await prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: 'refresh-blocked-123',
          username: 'refreshblockeduser',
          isActive: false,
        },
      });

      const refreshToken = 'inactive-refresh-token';
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5);

      await prisma.refreshToken.create({
        data: {
          id: uuidv7(),
          token: refreshToken,
          userId: user.id,
          expiresAt,
        },
      });

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(
        'User account is deactivated',
      );
    });
  });
});
