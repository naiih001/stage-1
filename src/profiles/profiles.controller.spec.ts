import { Test, TestingModule } from '@nestjs/testing';

import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: ProfilesService;

  const mockProfile = {
    id: 'b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12',
    name: 'ella',
    gender: 'female',
    gender_probability: 0.99,
    sample_size: 1234,
    age: 46,
    age_group: 'adult',
    country_id: 'DRC',

    country_probability: 0.85,
    created_at: '2026-04-01T12:00:00Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: ProfilesService,
          useValue: {
            create: jest.fn().mockResolvedValue({
              status: 'success',
              data: mockProfile,
            }),
            findOne: jest.fn().mockResolvedValue({
              status: 'success',
              data: mockProfile,
            }),
            findAll: jest.fn().mockResolvedValue({
              status: 'success',
              count: 1,
              data: [mockProfile],
            }),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
    service = module.get<ProfilesService>(ProfilesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('should call service.create', async () => {
      const dto = { name: 'ella' };
      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result.status).toBe('success');
    });
  });

  describe('findOne()', () => {
    it('should return profile by id', async () => {
      const result = await controller.findOne('test-id');

      expect(service.findOne).toHaveBeenCalledWith('test-id');
      expect(result.status).toBe('success');
    });
  });

  describe('findAll()', () => {
    it('should return filtered profiles', async () => {
      const result = await controller.findAll('male', 'NG', 'adult');

      expect(service.findAll).toHaveBeenCalledWith({
        gender: 'male',
        country_id: 'NG',
        age_group: 'adult',
      });
      expect(result.count).toBe(1);
    });
  });

  describe('remove()', () => {
    it('should call service.remove', async () => {
      await controller.remove('test-id');
      expect(service.remove).toHaveBeenCalledWith('test-id');
    });
  });
});
