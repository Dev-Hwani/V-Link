import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { SignupDto } from "./dto/signup.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);

    if (!matched) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendorId ?? null,
    });
  }

  async signupRequester(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("Email already exists");
    }

    if (dto.role === Role.ADMIN) {
      const expectedCode = this.configService.get<string>("ADMIN_SIGNUP_CODE");
      if (!expectedCode || dto.adminSignupCode !== expectedCode) {
        throw new ForbiddenException("Invalid admin signup code");
      }
    }

    let vendorId: string | null = null;
    if (dto.role === Role.VENDOR) {
      if (!dto.vendorCode) {
        throw new ConflictException("vendorCode is required for vendor signup");
      }

      const vendor = await this.prisma.vendor.upsert({
        where: { code: dto.vendorCode },
        create: {
          code: dto.vendorCode,
          name: dto.vendorName?.trim() || dto.vendorCode,
        },
        update: dto.vendorName?.trim()
          ? {
              name: dto.vendorName.trim(),
            }
          : {},
      });
      vendorId = vendor.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        vendorId,
      },
    });

    return this.issueSessionToken({
      sub: created.id,
      email: created.email,
      role: created.role,
      vendorId: created.vendorId ?? null,
    });
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const saved = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            vendorId: true,
          },
        },
      },
    });

    if (!saved) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const now = new Date();
    if (saved.revokedAt || saved.expiresAt <= now) {
      await this.revokeActiveUserTokens(saved.userId);
      throw new UnauthorizedException("Invalid refresh token");
    }

    const userPayload: AuthUser = {
      sub: saved.user.id,
      email: saved.user.email,
      role: saved.user.role,
      vendorId: saved.user.vendorId ?? null,
    };

    return this.issueSessionToken(userPayload, saved.id);
  }

  async logout(dto: LogoutDto) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const saved = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        revokedAt: true,
      },
    });

    if (saved && !saved.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: saved.id },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return { success: true };
  }

  async register(actor: AuthUser, dto: RegisterDto) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only admin can register users");
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      throw new ConflictException("Email already exists");
    }

    if (dto.role === Role.VENDOR && !dto.vendorId) {
      throw new ConflictException("vendorId is required for vendor users");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        vendorId: dto.role === Role.VENDOR ? dto.vendorId : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        vendorId: true,
        createdAt: true,
      },
    });

    return created;
  }

  private async issueSessionToken(payload: AuthUser, rotateFromTokenId?: string) {
    const refreshRecord = await this.createRefreshToken(payload.sub);

    if (rotateFromTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: rotateFromTokenId },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: refreshRecord.id,
        },
      });
    }

    return {
      accessToken: await this.jwtService.signAsync(payload),
      refreshToken: refreshRecord.token,
      user: payload,
    };
  }

  private hashRefreshToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private resolveRefreshTokenTtlDays() {
    const raw = this.configService.get<string>("REFRESH_TOKEN_EXPIRES_DAYS") ?? "14";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 14;
    }
    return Math.floor(parsed);
  }

  private async createRefreshToken(userId: string) {
    const plain = randomBytes(64).toString("hex");
    const tokenHash = this.hashRefreshToken(plain);
    const expiresAt = new Date(Date.now() + this.resolveRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);

    const saved = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });

    return {
      id: saved.id,
      token: plain,
    };
  }

  private async revokeActiveUserTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
