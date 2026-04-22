import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesService } from './profiles.service';
import { PrismaService } from './prisma.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of } from 'rxjs';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: PrismaService;
  let httpService: HttpService;

  const mockProfile = {
    id: '01964d85-6c50-7d11-a6e9-2081ea0f1234',
    name: 'ella',
    gender: 'female',
    genderProbability: 0.99,
    age: 46,
    ageGroup: 'adult',
    countryId: 'CD',
    countryName: 'Congo - Kinshasa',
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
            $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
              Promise.all(queries),
            ),
            profile: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
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
      jest.spyOn(prisma.profile, 'findFirst').mockResolvedValue(mockProfile);

      const result = await service.create({ name: 'Ella' });

      expect(result.status).toBe('success');
      expect(result.message).toBe('Profile already exists');
    });

    it('should create new profile with data from 3 APIs', async () => {
      jest.spyOn(prisma.profile, 'findFirst').mockResolvedValue(null);

      // Mock external APIs

      jest.spyOn(httpService, 'get').mockImplementation((url: string) => {
        if (url.includes('genderize')) {
          return of({
            data: { gender: 'female', probability: 0.99, count: 1234 },
          });
        }
        if (url.includes('agify')) {
          return of({ data: { age: 46 } });
        }
        if (url.includes('nationalize')) {
          return of({
            data: { country: [{ country_id: 'CD', probability: 0.85 }] },
          });
        }
        throw new Error('Unexpected URL');
      });

      jest.spyOn(prisma.profile, 'create').mockResolvedValue(mockProfile);

      const result = await service.create({ name: 'ella' });

      expect(result.status).toBe('success');
      expect(result.data.name).toBe('ella');
      expect(result.data.gender).toBe('female');
      expect(result.data.age_group).toBe('adult');
      expect(result.data.country_name).toBe('Congo - Kinshasa');
    });

    it('should throw 502 if Genderize returns invalid data', async () => {
      jest.spyOn(prisma.profile, 'findFirst').mockResolvedValue(null);
      jest
        .spyOn(httpService, 'get')
        .mockImplementation(() => of({ data: { gender: null, count: 0 } }));

      await expect(service.create({ name: 'ella' })).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('findAll()', () => {
    it('should filter, paginate, and sort profiles correctly', async () => {
      jest.spyOn(prisma.profile, 'count').mockResolvedValue(1);
      const findManySpy = jest
        .spyOn(prisma.profile, 'findMany')
        .mockResolvedValue([mockProfile]);

      const result = await service.findAll({
        gender: 'female',
        country_id: 'CD',
        min_age: '30',
        sort_by: 'age',
        order: 'desc',
        page: '2',
        limit: '5',
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          gender: 'female',
          countryId: 'CD',
          age: { gte: 30 },
        },
        orderBy: { age: 'desc' },
        skip: 5,
        take: 5,
      });
    });

    it('should reject invalid query parameters', async () => {
      await expect(
        service.findAll({
          min_age: 'abc',
        }),
      ).rejects.toThrow('Invalid query parameters');
    });
  });

  describe('search()', () => {
    it('should interpret natural language queries', async () => {
      jest.spyOn(prisma.profile, 'count').mockResolvedValue(1);
      const findManySpy = jest
        .spyOn(prisma.profile, 'findMany')
        .mockResolvedValue([mockProfile]);

      const result = await service.search({
        q: 'adult males from kenya',
        page: '1',
        limit: '10',
      });
      expect(result.total).toBe(1);
      expect(findManySpy).toHaveBeenCalledWith({
        where: {
          gender: 'male',
          ageGroup: 'adult',
          countryId: 'KE',
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('should reject uninterpretable search queries', async () => {
      await expect(
        service.search({ q: 'show me something useful' }),
      ).rejects.toThrow('Unable to interpret query');
    });
  });
});
