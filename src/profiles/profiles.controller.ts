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
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ProfileQueryDto, SearchQueryDto } from './dto/profile-query.dto';

@Controller('profiles')
export class ProfilesController {
  private readonly logger = new Logger(ProfilesController.name);

  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  async create(@Body() createProfileDto: CreateProfileDto) {
    this.logger.log(`POST /profiles - payload: ${JSON.stringify(createProfileDto)}`);
    return this.profilesService.create(createProfileDto);
  }

  @Get('search')
  async search(@Query() query: SearchQueryDto) {
    this.logger.log(`GET /profiles/search - query: ${JSON.stringify(query)}`);
    return this.profilesService.search(query);
  }

  @Get()
  async findAll(@Query() query: ProfileQueryDto) {
    this.logger.log(`GET /profiles - query: ${JSON.stringify(query)}`);
    return this.profilesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.log(`GET /profiles/${id}`);
    return this.profilesService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    this.logger.log(`DELETE /profiles/${id}`);
    return this.profilesService.remove(id);
  }
}
