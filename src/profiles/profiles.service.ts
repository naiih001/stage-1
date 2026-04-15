import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { uuidv7 } from 'uuidv7';
import { CreateProfileDto } from './dto/create-profile.dto';

interface ApiResponse {
  gender?: string;
  probability?: number;
  count?: number;
  age?: number;
  country?: Array<{ country_id: string; probability: number }>;
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
  ) {}

  private async fetchApi<T>(url: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch {
      this.logger.error(`External API request failed: ${url}`);
      throw new HttpException('External API failed', HttpStatus.BAD_GATEWAY);
    }
  }

  async create(createProfileDto: CreateProfileDto) {
    const { name } = createProfileDto;
    if (!name?.trim()) {
      throw new BadRequestException('Name is required');
    }

    const lowerName = name.toLowerCase().trim();
    this.logger.log(`Create profile requested for name=${lowerName}`);

    // Check idempotency
    const existing = await this.prisma.profile.findUnique({
      where: { name: lowerName },
    });

    if (existing) {
      this.logger.log(`Returning existing profile id=${existing.id}`);
      return {
        status: 'success',
        message: 'Profile already exists',
        data: this.formatProfile(existing),
      };
    }

    // Fetch from all APIs
    const [genderData, ageData, nationalData] = await Promise.all([
      this.fetchApi<ApiResponse>(`https://api.genderize.io?name=${lowerName}`),
      this.fetchApi<ApiResponse>(`https://api.agify.io?name=${lowerName}`),
      this.fetchApi<ApiResponse>(
        `https://api.nationalize.io?name=${lowerName}`,
      ),
    ]);

    // Validation
    if (!genderData.gender || genderData.count === 0) {
      throw new HttpException('Genderize returned an invalid response', 502);
    }
    if (ageData.age === null || ageData.age === undefined) {
      throw new HttpException('Agify returned an invalid response', 502);
    }
    if (!nationalData.country || nationalData.country.length === 0) {
      throw new HttpException('Nationalize returned an invalid response', 502);
    }

    const topCountry = nationalData.country.reduce((prev, curr) =>
      curr.probability > prev.probability ? curr : prev,
    );

    const ageGroup =
      ageData.age <= 12
        ? 'child'
        : ageData.age <= 19
          ? 'teenager'
          : ageData.age <= 59
            ? 'adult'
            : 'senior';

    const profile = await this.prisma.profile.create({
      data: {
        id: uuidv7(),
        name: lowerName,
        gender: genderData.gender,
        genderProbability: genderData.probability,
        sampleSize: genderData.count,
        age: ageData.age,
        ageGroup,
        countryId: topCountry.country_id,
        countryProbability: topCountry.probability,
      },
    });

    this.logger.log(`Created profile id=${profile.id} name=${profile.name}`);

    return {
      status: 'success',
      data: this.formatProfile(profile),
    };
  }

  async findOne(id: string) {
    this.logger.log(`Fetching profile id=${id}`);
    const profile = await this.prisma.profile.findUnique({ where: { id } });
    if (!profile)
      throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    return { status: 'success', data: this.formatProfile(profile) };
  }

  async findAll(filters: {
    gender?: string;
    country_id?: string;
    age_group?: string;
  }) {
    this.logger.log(`Listing profiles with filters=${JSON.stringify(filters)}`);
    const where: any = {};

    if (filters.gender) where.gender = filters.gender.toLowerCase();
    if (filters.country_id) where.countryId = filters.country_id.toUpperCase();
    if (filters.age_group) where.ageGroup = filters.age_group.toLowerCase();

    const profiles = await this.prisma.profile.findMany({
      where,
      select: {
        id: true,
        name: true,
        gender: true,
        age: true,
        ageGroup: true,
        countryId: true,
      },
    });

    return {
      status: 'success',
      count: profiles.length,
      data: profiles.map((profile) => this.formatListProfile(profile)),
    };
  }

  async remove(id: string) {
    this.logger.log(`Deleting profile id=${id}`);
    await this.prisma.profile.delete({ where: { id } }).catch(() => {
      throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    });
    this.logger.log(`Deleted profile id=${id}`);
    return; // 204 No Content
  }

  private formatProfile(profile: any) {
    return {
      id: profile.id,
      name: profile.name,

      gender: profile.gender,
      gender_probability: profile.genderProbability,
      sample_size: profile.sampleSize,
      age: profile.age,
      age_group: profile.ageGroup,
      country_id: profile.countryId,
      country_probability: profile.countryProbability,
      created_at: profile.createdAt.toISOString(),
    };
  }

  private formatListProfile(profile: any) {
    return {
      id: profile.id,
      name: profile.name,
      gender: profile.gender,
      age: profile.age,
      age_group: profile.ageGroup,
      country_id: profile.countryId,
    };
  }
}
