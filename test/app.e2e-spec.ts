import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import request, { Response } from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ValidationError } from 'class-validator';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

interface ProfileResponseBody {
  status: string;
  message?: string;
  data: {
    id: string;
    name: string;
    gender?: string;
    age?: number;
    age_group?: string;
    country_id?: string;
    country_name?: string;
    gender_probability?: number;
  };
}

interface ProfilesListResponseBody {
  status: string;
  page: number;
  limit: number;
  total: number;
  data: Array<{
    id: string;
    name: string;
    gender?: string;
    age?: number;
    age_group?: string;
    country_id?: string;
  }>;
}

describe('ProfilesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockHttpService = {
    get: jest.fn((url: string) => {
      let data = {};
      if (url.includes('genderize.io')) {
        data = { gender: 'female', probability: 0.99, count: 1000 };
      } else if (url.includes('agify.io')) {
        data = { age: 25 };
      } else if (url.includes('nationalize.io')) {
        data = { country: [{ country_id: 'US', probability: 0.8 }] };
      }

      const response: AxiosResponse = {
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };
      return of(response);
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(mockHttpService)
      .compile();

    app = moduleFixture.createNestApplication();
    
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            exceptionFactory: (errors: ValidationError[]) => {
                const firstError = errors[0];
                const constraints = firstError.constraints ?? {};

                if (constraints.isNotEmpty) {
                    return new BadRequestException('Name is required');
                }

                return new UnprocessableEntityException(
                    'Invalid query parameters',
                );
            },
        }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  beforeEach(async () => {
    await prisma.profile.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('Basic CRUD and Idempotency', () => {
    it('should perform the full lifecycle of a profile', async () => {
      const listRes1 = await request(app.getHttpServer())
        .get('/api/profiles')
        .expect(200);
      expect(listRes1.body.status).toBe('success');
      expect(listRes1.body.total).toBe(0);

      const name = `Ada_${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/api/profiles')
        .send({ name })
        .expect(201);
      
      const createdProfile = createRes.body.data;
      expect(createRes.body.status).toBe('success');
      expect(createdProfile.name).toBe(name);
      expect(createdProfile.id).toBeDefined();

      const createdId = createdProfile.id;

      const listRes2 = await request(app.getHttpServer())
        .get('/api/profiles')
        .expect(200);
      expect(listRes2.body.total).toBe(1);

      const createAgainRes = await request(app.getHttpServer())
        .post('/api/profiles')
        .send({ name })
        .expect(201);
      expect(createAgainRes.body.status).toBe('success');
      expect(createAgainRes.body.message).toBe('Profile already exists');
      expect(createAgainRes.body.data.id).toBe(createdId);

      const getRes = await request(app.getHttpServer())
        .get(`/api/profiles/${createdId}`)
        .expect(200);
      expect(getRes.body.status).toBe('success');
      expect(getRes.body.data.id).toBe(createdId);

      await request(app.getHttpServer())
        .delete(`/api/profiles/${createdId}`)
        .expect(204);

      const getDeletedRes = await request(app.getHttpServer())
        .get(`/api/profiles/${createdId}`)
        .expect(404);
      expect(getDeletedRes.body.status).toBe('error');
      expect(getDeletedRes.body.message).toBe('Profile not found');

      const listRes3 = await request(app.getHttpServer())
        .get('/api/profiles')
        .expect(200);
      expect(listRes3.body.total).toBe(0);
    });
  });

  describe('Filtering and Sorting', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/api/profiles').send({ name: 'Alice' });
      await request(app.getHttpServer()).post('/api/profiles').send({ name: 'Bob' });
    });

    it('GET /api/profiles - should filter by gender', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/profiles?gender=female')
        .expect(200);
      
      const body = res.body as ProfilesListResponseBody;
      expect(body.status).toBe('success');
      const females = body.data.filter(p => p.gender === 'female');
      expect(females.length).toBeGreaterThan(0);
    });

    it('GET /api/profiles - should sort and paginate', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/profiles?sort_by=age&order=desc&page=1&limit=1')
        .expect(200);
      
      const body = res.body as ProfilesListResponseBody;
      expect(body.status).toBe('success');
      expect(body.page).toBe(1);
      expect(body.limit).toBe(1);
      expect(body.data.length).toBeLessThanOrEqual(1);
    });

    it('GET /api/profiles - should sort by gender_probability', async () => {
      await request(app.getHttpServer())
        .get('/api/profiles?sort_by=gender_probability&order=asc')
        .expect(200);
    });
  });

  describe('Natural Language Search', () => {
    it('GET /api/profiles/search - should perform searches', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/profiles')
        .send({ name: 'John' });
      const profile = createRes.body.data;

      const res = await request(app.getHttpServer())
        .get(`/api/profiles/search?q=males from ${profile.country_id || 'US'}`)
        .expect(200);
      expect(res.body.status).toBe('success');

      await request(app.getHttpServer()).get('/api/profiles/search?q=young people').expect(200);
      await request(app.getHttpServer()).get('/api/profiles/search?q=people older than 40').expect(200);
      await request(app.getHttpServer()).get('/api/profiles/search?q=people under 20').expect(200);
    });

    it('GET /api/profiles/search - should return 400 for uninterpretable query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/profiles/search?q=show me something useful')
        .expect(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Unable to interpret query');
    });
  });

  describe('Validation', () => {
    it('should return 422 for invalid filter validation', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/profiles?gender=robot')
        .expect(422);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('Invalid query parameters');
    });

    it('should return 422 for limit boundary validation (too high)', async () => {
      await request(app.getHttpServer())
        .get('/api/profiles?limit=51')
        .expect(422);
    });

    it('should return 422 for page boundary validation (too low)', async () => {
      await request(app.getHttpServer())
        .get('/api/profiles?page=0')
        .expect(422);
    });

    it('should return 422 for missing search query validation', async () => {
      await request(app.getHttpServer())
        .get('/api/profiles/search')
        .expect(422);
    });
  });
});
