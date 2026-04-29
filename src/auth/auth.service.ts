import {
  Injectable,
  UnauthorizedException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from 'uuidv7';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateGithubUser(profile: any) {
    const { id: githubId, username, emails, _json } = profile;
    const email = emails?.[0]?.value;
    const avatarUrl = _json?.avatar_url;

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
          username: username || `user_${githubId}`,
          email,
          avatarUrl,
          role: username === 'admin' ? 'ADMIN' : 'ANALYST',
          lastLoginAt: new Date(),
        },
      });
    } else {
      // Update user info if needed
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          username: username || user.username,
          email: email || user.email,
          avatarUrl: avatarUrl || user.avatarUrl,
          role:
            username === 'admin' || user.username === 'admin'
              ? 'ADMIN'
              : user.role,
          lastLoginAt: new Date(),
        },
      });
    }

    return user;
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
