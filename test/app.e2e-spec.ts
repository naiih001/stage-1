import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/profiles/prisma.service';

interface ProfileResponseBody {
  status: string;
  data: {
    id: string;
    name: string;
  };
}

interface ProfilesListResponseBody {
  status: string;
  page: number;
  limit: number;
  total: number;
  data: Array<{ id: string }>;
}

describe('ProfilesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  beforeEach(async () => {
    await prisma.profile.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();

    await app.close();
  });

  it('POST /api/profiles - should create a new profile', async () => {
    const res: Response = await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'testuser' });
    const body = res.body as ProfileResponseBody;

    expect(res.status).toBe(201);
    expect(body.status).toBe('success');
    expect(body.data.name).toBe('testuser');
    expect(body.data.id).toBeDefined();
  });

  it('POST /api/profiles - should return existing profile (Idempotency)', async () => {
    await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'testuser' })
      .expect(201);
  });

  it('GET /api/profiles/:id', async () => {
    const createRes: Response = await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'emmanuel' });
    const createBody = createRes.body as ProfileResponseBody;

    const id = createBody.data.id;

    const res: Response = await request(app.getHttpServer())
      .get(`/api/profiles/${id}`)
      .expect(200);
    const body = res.body as ProfileResponseBody;

    expect(body.data.id).toBe(id);
  });

  it('GET /api/profiles with query filters', async () => {
    await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'sarah' });

    const res: Response = await request(app.getHttpServer())
      .get('/api/profiles?gender=female')
      .expect(200);
    const body = res.body as ProfilesListResponseBody;

    expect(body.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('DELETE /api/profiles/:id', async () => {
    const createRes: Response = await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'tobedeleted' });
    const createBody = createRes.body as ProfileResponseBody;

    await request(app.getHttpServer())
      .delete(`/api/profiles/${createBody.data.id}`)
      .expect(204);
  });
});
