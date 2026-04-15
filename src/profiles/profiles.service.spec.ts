import { Test, TestingModule } from '@nestjs/testing';

import { ProfilesService } from './profiles.service';
import { PrismaService } from './prisma.service';
import { HttpService } from '@nestjs/axios';

import { BadRequestException, HttpException } from '@nestjs/common';
import { of } from 'rxjs';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: PrismaService;
  let httpService: HttpService;

  const mockProfile = {
    id: 'b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12',
    name: 'ella',
    gender: 'female',
    genderProbability: 0.99,
    sampleSize: 1234,
    age: 46,
    ageGroup: 'adult',
    countryId: 'DRC',
    countryProbability: 0.85,

    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,

        {
          provide: PrismaService,
          useValue: {
            profile: {
              findUnique: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    prisma = module.get<PrismaService>(PrismaService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('should return existing profile if name already exists (Idempotency)', async () => {
      jest.spyOn(prisma.profile, 'findUnique').mockResolvedValue(mockProfile);

      const result = await service.create({ name: 'Ella' });

      expect(result.status).toBe('success');
      expect(result.message).toBe('Profile already exists');
    });

    it('should create new profile with data from 3 APIs', async () => {
      jest.spyOn(prisma.profile, 'findUnique').mockResolvedValue(null);

      // Mock external APIs

      jest.spyOn(httpService, 'get').mockImplementation((url: string) => {
        if (url.includes('genderize')) {
          return of({
            data: { gender: 'female', gender_probability: 0.99, count: 1234 },
          });
        }
        if (url.includes('agify')) {
          return of({ data: { age: 46 } });
        }
        if (url.includes('nationalize')) {
          return of({
            data: { country: [{ country_id: 'DRC', probability: 0.85 }] },
          });
        }
      });

      jest.spyOn(prisma.profile, 'create').mockResolvedValue(mockProfile);

      const result = await service.create({ name: 'ella' });

      expect(result.status).toBe('success');
      expect(result.data.name).toBe('ella');
      expect(result.data.gender).toBe('female');
      expect(result.data.age_group).toBe('adult');
    });

    it('should throw 502 if Genderize returns invalid data', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockImplementation(() => of({ data: { gender: null, count: 0 } }));

      await expect(service.create({ name: 'ella' })).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('findAll()', () => {
    it('should filter profiles correctly', async () => {
      jest.spyOn(prisma.profile, 'findMany').mockResolvedValue([mockProfile]);

      const result = await service.findAll({
        gender: 'female',
        country_id: 'DRC',
      });

      expect(result.count).toBe(1);
      expect(prisma.profile.findMany).toHaveBeenCalledWith({
        where: { gender: 'female', countryId: 'DRC' },
        select: expect.any(Object),
      });
    });
  });
});
