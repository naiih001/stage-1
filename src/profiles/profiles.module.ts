import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { HttpModule } from '@nestjs/axios';
import { ProfilesController } from './profiles.controller';
import { PrismaService } from './prisma.service';

@Module({
  imports: [HttpModule],
  providers: [PrismaService, ProfilesService],
  controllers: [ProfilesController],
})
export class ProfilesModule {}
