import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfileQueryDto, SearchQueryDto } from './dto/profile-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('profiles')
export class ProfilesController {
  private readonly logger = new Logger(ProfilesController.name);

  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() createProfileDto: CreateProfileDto) {
    this.logger.log(`POST /profiles - payload: ${JSON.stringify(createProfileDto)}`);
    return this.profilesService.create(createProfileDto);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  async search(@Query() query: SearchQueryDto) {
    this.logger.log(`GET /profiles/search - query: ${JSON.stringify(query)}`);
    return this.profilesService.search(query);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  async findAll(@Query() query: ProfileQueryDto) {
    this.logger.log(`GET /profiles - query: ${JSON.stringify(query)}`);
    return this.profilesService.findAll(query);
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  async export(
    @Query() query: ProfileQueryDto,
    @Query('format') format: string,
    @Res() res: any,
  ) {
    this.logger.log(`GET /profiles/export - format: ${format}`);
    if (format !== 'csv') {
      throw new BadRequestException('Invalid format. Only "csv" is supported.');
    }

    const csv = await this.profilesService.exportToCsv(query);
    const timestamp = Date.now();

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="profiles_${timestamp}.csv"`,
    });

    return res.status(200).send(csv);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  async findOne(@Param('id') id: string) {
    this.logger.log(`GET /profiles/${id}`);
    return this.profilesService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    this.logger.log(`DELETE /profiles/${id}`);
    return this.profilesService.remove(id);
  }
}
