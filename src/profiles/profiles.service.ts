import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Profile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { uuidv7 } from 'uuidv7';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfileQueryDto, SearchQueryDto } from './dto/profile-query.dto';
import { getCountryName } from './country-reference';
import {
  buildOrderBy,
  buildWhereClause,
  parseNaturalLanguageQuery,
} from './query-engine';

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
      return response.data as T;
    } catch {
      this.logger.error(`External API request failed: ${url}`);
      throw new HttpException('External API failed', HttpStatus.BAD_GATEWAY);
    }
  }

  async create(createProfileDto: CreateProfileDto) {
    const { name } = createProfileDto;
    const normalizedName = name.trim();
    this.logger.log(`Create profile requested for name=${normalizedName}`);

    const existing = await this.prisma.profile.findFirst({
      where: { name: { equals: normalizedName, mode: 'insensitive' } },
    });

    if (existing) {
      this.logger.log(`Returning existing profile id=${existing.id}`);
      return {
        status: 'success',
        message: 'Profile already exists',
        data: this.formatProfile(existing),
      };
    }

    const [genderData, ageData, nationalData] = await Promise.all([
      this.fetchApi<ApiResponse>(
        `https://api.genderize.io/?name=${encodeURIComponent(normalizedName)}`,
      ),
      this.fetchApi<ApiResponse>(
        `https://api.agify.io/?name=${encodeURIComponent(normalizedName)}`,
      ),
      this.fetchApi<ApiResponse>(
        `https://api.nationalize.io/?name=${encodeURIComponent(normalizedName)}`,
      ),
    ]);

    if (!genderData.gender || genderData.count === 0 || genderData.probability === undefined) {
      throw new HttpException('Genderize returned an invalid response', HttpStatus.BAD_GATEWAY);
    }
    if (ageData.age === undefined || ageData.age === null) {
      throw new HttpException('Agify returned an invalid response', HttpStatus.BAD_GATEWAY);
    }
    if (!nationalData.country || nationalData.country.length === 0) {
      throw new HttpException('Nationalize returned an invalid response', HttpStatus.BAD_GATEWAY);
    }

    const topCountry = nationalData.country.reduce((prev, curr) =>
      curr.probability > prev.probability ? curr : prev,
    );

    if (!topCountry.country_id || topCountry.probability === undefined) {
      throw new HttpException('Nationalize returned an invalid response', HttpStatus.BAD_GATEWAY);
    }

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
        name: normalizedName,
        gender: genderData.gender,
        genderProbability: genderData.probability,
        age: ageData.age,
        ageGroup,
        countryId: topCountry.country_id,
        countryName: getCountryName(topCountry.country_id),
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

  async findAll(query: ProfileQueryDto) {
    this.logger.log(`Listing profiles with query=${JSON.stringify(query)}`);
    return this.queryProfiles(query);
  }

  async search(searchQuery: SearchQueryDto) {
    this.logger.log(`Searching profiles with q=${searchQuery.q}`);
    const derived = parseNaturalLanguageQuery(searchQuery.q);
    
    const combinedQuery: ProfileQueryDto = {
      ...new ProfileQueryDto(),
      ...derived,
      page: searchQuery.page,
      limit: searchQuery.limit,
    };

    return this.queryProfiles(combinedQuery);
  }

  async remove(id: string) {
    this.logger.log(`Deleting profile id=${id}`);
    try {
      await this.prisma.profile.delete({ where: { id } });
    } catch {
      throw new HttpException('Profile not found', HttpStatus.NOT_FOUND);
    }
    this.logger.log(`Deleted profile id=${id}`);
  }

  private formatProfile(profile: Profile) {
    return {
      id: profile.id,
      name: profile.name,
      gender: profile.gender,
      gender_probability: profile.genderProbability,
      age: profile.age,
      age_group: profile.ageGroup,
      country_id: profile.countryId,
      country_name: profile.countryName,
      country_probability: profile.countryProbability,
      created_at: profile.createdAt.toISOString(),
    };
  }

  private async queryProfiles(query: ProfileQueryDto) {
    const where = buildWhereClause(query);
    const orderBy = buildOrderBy(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [total, profiles] = await this.prisma.$transaction([
      this.prisma.profile.count({ where }),
      this.prisma.profile.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return {
      status: 'success',
      page,
      limit,
      total,
      data: profiles.map((profile) => this.formatProfile(profile)),
    };
  }
}
