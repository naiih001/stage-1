import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { HttpModule } from '@nestjs/axios';
import { ProfilesController } from './profiles.controller';

@Module({
  imports: [HttpModule],
  providers: [ProfilesService],
  controllers: [ProfilesController],
})
export class ProfilesModule {}
