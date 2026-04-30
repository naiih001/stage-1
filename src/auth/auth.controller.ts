import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  Res,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { GithubCliLoginDto } from './dto/github-cli-login.dto';
import { Request, Response } from 'express';
import { REDIRECT_MAP } from './constants/redirect-map.const';

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
  async githubAuthCallback(@Req() req: Request, @Res() res: Response) {
    const state = req.query.state as string;
    const jwt = this.authService.signToken(req.user as any);

    if (state) {
      try {
        const { client, port } = JSON.parse(
          Buffer.from(state, 'base64').toString(),
        );

        if (client === 'cli' && port) {
          return res.redirect(`${REDIRECT_MAP.cli(port)}?token=${jwt}`);
        }
      } catch (e) {
        // Fallback to web if state parsing fails
      }
    }

    return res.redirect(`${REDIRECT_MAP.web}?token=${jwt}`);
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
