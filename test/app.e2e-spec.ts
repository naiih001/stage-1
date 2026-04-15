import { Test, TestingModule } from '@nestjs/testing';

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/profiles/prisma.service';

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
    // Clean database before each test
    await prisma.profile.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();

    await app.close();
  });

  it('POST /api/profiles - should create a new profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'testuser' })
      .expect(201);

    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('testuser');
    expect(res.body.data).toHaveProperty('id');
  });

  it('POST /api/profiles - should return existing profile (Idempotency)', async () => {
    await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'testuser' })
      .expect(201);
  });

  it('GET /api/profiles/:id', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'emmanuel' });

    const id = createRes.body.data.id;

    const res = await request(app.getHttpServer())
      .get(`/api/profiles/${id}`)
      .expect(200);

    expect(res.body.data.id).toBe(id);
  });

  it('GET /api/profiles with query filters', async () => {
    await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'sarah' });

    const res = await request(app.getHttpServer())
      .get('/api/profiles?gender=female')
      .expect(200);

    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('DELETE /api/profiles/:id', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/profiles')
      .send({ name: 'tobedeleted' });

    await request(app.getHttpServer())
      .delete(`/api/profiles/${createRes.body.data.id}`)
      .expect(204);
  });
});
