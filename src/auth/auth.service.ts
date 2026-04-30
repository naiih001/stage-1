import {
  Injectable,
  UnauthorizedException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from 'uuidv7';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { GithubCliLoginDto } from './dto/github-cli-login.dto';

interface GithubUserProfile {
  id: string | number;
  username?: string;
  emails?: Array<{ value?: string }>;
  _json?: {
    avatar_url?: string;
    login?: string;
    email?: string;
  };
}

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GithubApiUser {
  id: number;
  login: string;
  email?: string | null;
  avatar_url?: string;
}

interface GithubApiEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  async validateGithubUser(profile: GithubUserProfile) {
    return this.upsertGithubUser(profile);
  }

  private async upsertGithubUser(profile: GithubUserProfile) {
    const { id: githubId, username, emails, _json } = profile;
    const email = emails?.[0]?.value;
    const avatarUrl = _json?.avatar_url;
    const githubUsername = username || _json?.login;

    let user = await this.prisma.user.findUnique({
      where: { githubId: String(githubId) },
    });

    if (user && !user.isActive) {
      this.logger.warn(`Inactive user attempted to login: ${user.username}`);
      throw new ForbiddenException('User account is deactivated');
    }

    if (!user) {
      this.logger.log(`Creating new user for GitHub ID: ${githubId}`);
      user = await this.prisma.user.create({
        data: {
          id: uuidv7(),
          githubId: String(githubId),
          username: githubUsername || `user_${githubId}`,
          email,
          avatarUrl,
          role: githubUsername === 'admin' ? 'ADMIN' : 'ANALYST',
          lastLoginAt: new Date(),
        },
      });
    } else {
      // Update user info if needed
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          username: githubUsername || user.username,
          email: email || user.email,
          avatarUrl: avatarUrl || user.avatarUrl,
          role:
            githubUsername === 'admin' || user.username === 'admin'
              ? 'ADMIN'
              : user.role,
          lastLoginAt: new Date(),
        },
      });
    }

    return user;
  }

  async loginWithGithubCode(githubCliLoginDto: GithubCliLoginDto) {
    let profile: GithubUserProfile;

    try {
      const githubAccessToken = await this.exchangeGithubCodeForToken(
        githubCliLoginDto,
      );
      profile = await this.getGithubProfile(githubAccessToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(`GitHub CLI login failed: ${(error as Error).message}`);
      throw new UnauthorizedException('GitHub authorization failed');
    }

    const user = await this.upsertGithubUser(profile);
    const tokens = await this.login(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  private async exchangeGithubCodeForToken({
    code,
    code_verifier,
    redirect_uri,
  }: GithubCliLoginDto): Promise<string> {
    const tokenPayload: Record<string, string | undefined> = {
      client_id: this.configService.get<string>('GITHUB_CLIENT_ID'),
      client_secret: this.configService.get<string>('GITHUB_CLIENT_SECRET'),
      code,
      code_verifier,
    };
    const callbackUrl =
      redirect_uri || this.configService.get<string>('GITHUB_CLI_CALLBACK_URL');

    if (callbackUrl) {
      tokenPayload.redirect_uri = callbackUrl;
    }

    const response = await firstValueFrom(
      this.httpService.post<GithubTokenResponse>(
        'https://github.com/login/oauth/access_token',
        tokenPayload,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      ),
    );

    if (response.data.error || !response.data.access_token) {
      throw new UnauthorizedException(
        response.data.error_description || 'GitHub authorization failed',
      );
    }

    return response.data.access_token;
  }

  private async getGithubProfile(
    githubAccessToken: string,
  ): Promise<GithubUserProfile> {
    const headers = {
      Authorization: `Bearer ${githubAccessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const [userResponse, emailsResponse] = await Promise.all([
      firstValueFrom(
        this.httpService.get<GithubApiUser>('https://api.github.com/user', {
          headers,
        }),
      ),
      firstValueFrom(
        this.httpService.get<GithubApiEmail[]>(
          'https://api.github.com/user/emails',
          { headers },
        ),
      ),
    ]);

    const primaryEmail = emailsResponse.data.find(
      (email) => email.primary && email.verified,
    );
    const email = primaryEmail?.email || userResponse.data.email || undefined;

    return {
      id: userResponse.data.id,
      username: userResponse.data.login,
      emails: email ? [{ value: email }] : undefined,
      _json: {
        login: userResponse.data.login,
        email,
        avatar_url: userResponse.data.avatar_url,
      },
    };
  }

  async login(user: any) {
    if (!user.isActive) {
      throw new ForbiddenException('User account is deactivated');
    }

    const payload = { sub: user.id, username: user.username, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: '3m',
    });

    const refreshTokenString = uuidv7();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes

    await this.prisma.refreshToken.create({
      data: {
        id: uuidv7(),
        token: refreshTokenString,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshTokenString,
    };
  }

  signToken(user: any) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    return this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: '3m',
    });
  }

  async refreshTokens(refreshToken: string) {
    const tokenDoc = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      if (tokenDoc) {
        await this.prisma.refreshToken.delete({ where: { id: tokenDoc.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old token
    await this.prisma.refreshToken.delete({ where: { id: tokenDoc.id } });

    if (!tokenDoc.user.isActive) {
      throw new ForbiddenException('User account is deactivated');
    }

    // Issue new tokens
    return this.login(tokenDoc.user);
  }

  async logout(refreshToken: string) {
    try {
      await this.prisma.refreshToken.delete({
        where: { token: refreshToken },
      });
    } catch {
      // Ignore if token doesn't exist
    }
    return { message: 'Logged out successfully' };
  }
}
