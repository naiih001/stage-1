import { Test, TestingModule } from '@nestjs/testing';

import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  const createMock = jest.fn();
  const findOneMock = jest.fn();
  const findAllMock = jest.fn();
  const searchMock = jest.fn();
  const removeMock = jest.fn();

  const mockProfile = {
    id: '01964d85-6c50-7d11-a6e9-2081ea0f1234',
    name: 'ella',
    gender: 'female',
    gender_probability: 0.99,
    age: 46,
    age_group: 'adult',
    country_id: 'CD',
    country_name: 'Congo - Kinshasa',
    country_probability: 0.85,
    created_at: '2026-04-01T12:00:00Z',
  };

  beforeEach(async () => {
    createMock.mockReset();
    findOneMock.mockReset();
    findAllMock.mockReset();
    searchMock.mockReset();
    removeMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: ProfilesService,
          useValue: {
            create: createMock.mockResolvedValue({
              status: 'success',
              data: mockProfile,
            }),
            findOne: findOneMock.mockResolvedValue({
              status: 'success',
              data: mockProfile,
            }),
            findAll: findAllMock.mockResolvedValue({
              status: 'success',
              page: 1,
              limit: 10,
              total: 1,
              data: [mockProfile],
            }),
            search: searchMock.mockResolvedValue({
              status: 'success',
              page: 1,
              limit: 10,
              total: 1,
              data: [mockProfile],
            }),
            remove: removeMock.mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('should call service.create', async () => {
      const dto = { name: 'ella' };
      const result = await controller.create(dto);

      expect(createMock).toHaveBeenCalledWith(dto);
      expect(result.status).toBe('success');
    });
  });

  describe('findOne()', () => {
    it('should return profile by id', async () => {
      const result = await controller.findOne('test-id');

      expect(findOneMock).toHaveBeenCalledWith('test-id');
      expect(result.status).toBe('success');
    });
  });

  describe('findAll()', () => {
    it('should return filtered profiles', async () => {
      const query = {
        gender: 'male' as const,
        age_group: 'adult' as const,
        country_id: 'NG',
        min_age: 25,
        max_age: 40,
        min_gender_probability: 0.7,
        min_country_probability: 0.5,
        sort_by: 'age' as const,
        order: 'desc' as const,
        page: 1,
        limit: 10,
      };
      const result = await controller.findAll(query);

      expect(findAllMock).toHaveBeenCalledWith(query);
      expect(result.total).toBe(1);
    });
  });

  describe('search()', () => {
    it('should forward the natural language query to the service', async () => {
      const query = {
        q: 'young males from nigeria',
        page: 2,
        limit: 5,
      };
      const result = await controller.search(query);

      expect(searchMock).toHaveBeenCalledWith(query);
      expect(result.total).toBe(1);
    });
  });

  describe('remove()', () => {
    it('should call service.remove', async () => {
      await controller.remove('test-id');
      expect(removeMock).toHaveBeenCalledWith('test-id');
    });
  });
});
