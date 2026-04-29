import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { uuidv7 } from 'uuidv7';
import { of } from 'rxjs';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

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
            GITHUB_CLI_CALLBACK_URL: 'http://127.0.0.1:4567/callback',
          })],
        }),
        AppModule,
      ],
    })
      .overrideProvider(HttpService)
      .useValue(mockHttpService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
    jest.clearAllMocks();
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

  describe('POST /api/auth/github/cli', () => {
    it('should exchange a GitHub code and PKCE verifier for app tokens', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'github-access-token',
          },
        }),
      );
      mockHttpService.get.mockImplementation((url: string) => {
        if (url.endsWith('/emails')) {
          return of({
            data: [
              {
                email: 'octocat@example.com',
                primary: true,
                verified: true,
              },
            ],
          });
        }

        return of({
          data: {
            id: 583231,
            login: 'octocat',
            email: null,
            avatar_url: 'https://avatars.githubusercontent.com/u/583231',
          },
        });
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/github/cli')
        .send({
          code: 'github-auth-code',
          code_verifier: 'cli-pkce-verifier',
          redirect_uri: 'http://127.0.0.1:4567/callback',
        })
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.user).toMatchObject({
        username: 'octocat',
        role: 'ANALYST',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          code: 'github-auth-code',
          code_verifier: 'cli-pkce-verifier',
          redirect_uri: 'http://127.0.0.1:4567/callback',
        }),
        expect.any(Object),
      );

      const user = await prisma.user.findUnique({
        where: { githubId: '583231' },
      });
      expect(user?.username).toBe('octocat');
      expect(user?.email).toBe('octocat@example.com');
    });

    it('should reject failed GitHub code exchanges', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            error: 'bad_verification_code',
            error_description: 'The code passed is incorrect or expired.',
          },
        }),
      );

      await request(app.getHttpServer())
        .post('/api/auth/github/cli')
        .send({
          code: 'expired-code',
          code_verifier: 'cli-pkce-verifier',
        })
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
