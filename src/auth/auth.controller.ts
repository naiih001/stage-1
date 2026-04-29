import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { GithubCliLoginDto } from './dto/github-cli-login.dto';
import type { Request } from 'express';

@Controller('/auth')

export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('github')
  @UseGuards(GithubAuthGuard)
  async githubAuth() {
    // Guards will handle the redirect
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubAuthCallback(@Req() req: Request) {
    return this.authService.login(req.user);
  }

  @Post('github/cli')
  async githubCliLogin(@Body() githubCliLoginDto: GithubCliLoginDto) {
    return this.authService.loginWithGithubCode(githubCliLoginDto);
  }

  @Post('refresh')
  async refresh(@Body('refresh_token') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('logout')
  async logout(@Body('refresh_token') refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return this.authService.logout(refreshToken);
  }
}
