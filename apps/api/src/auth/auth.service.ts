import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { RefreshToken, Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes, randomUUID } from "crypto";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { SignupDto } from "./dto/signup.dto";

const REVOKE_REASON = {
  ROTATED: "ROTATED",
  LOGOUT: "LOGOUT",
  LOGOUT_ALL: "LOGOUT_ALL",
  EXPIRED: "EXPIRED",
  REUSE_DETECTED: "REUSE_DETECTED",
} as const;

interface AuthClientMeta {
  userAgent: string | null;
  ipAddress: string | null;
}

interface IssueTokenOptions {
  rotateFromToken?: Pick<RefreshToken, "id" | "sessionId">;
  clientMeta?: AuthClientMeta;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto, clientMeta?: AuthClientMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);

    if (!matched) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueSessionToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        vendorId: user.vendorId ?? null,
      },
      {
        clientMeta,
      },
    );
  }

  async signupRequester(dto: SignupDto, clientMeta?: AuthClientMeta) {
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

    return this.issueSessionToken(
      {
        sub: created.id,
        email: created.email,
        role: created.role,
        vendorId: created.vendorId ?? null,
      },
      {
        clientMeta,
      },
    );
  }

  async refresh(dto: RefreshTokenDto, clientMeta?: AuthClientMeta) {
    if (!dto.refreshToken) {
      throw new UnauthorizedException("Refresh token is missing");
    }

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
    if (saved.revokedAt) {
      const reuseDetected = await this.handleRevokedTokenUse(saved);
      if (reuseDetected) {
        throw new UnauthorizedException("Refresh token reuse detected. Please login again.");
      }
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (saved.expiresAt <= now) {
      await this.safeRevokeToken(saved.id, REVOKE_REASON.EXPIRED);
      throw new UnauthorizedException("Refresh token expired");
    }

    const userPayload: AuthUser = {
      sub: saved.user.id,
      email: saved.user.email,
      role: saved.user.role,
      vendorId: saved.user.vendorId ?? null,
    };

    return this.issueSessionToken(userPayload, {
      rotateFromToken: {
        id: saved.id,
        sessionId: saved.sessionId,
      },
      clientMeta,
    });
  }

  async logout(dto: LogoutDto) {
    if (!dto.refreshToken) {
      return { success: true };
    }

    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const saved = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
      },
    });

    if (saved) {
      await this.safeRevokeToken(saved.id, REVOKE_REASON.LOGOUT);
    }

    return { success: true };
  }

  async logoutAll(user: AuthUser) {
    const now = new Date();
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId: user.sub,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
        revokedReason: REVOKE_REASON.LOGOUT_ALL,
      },
    });

    return {
      success: true,
      revokedCount: result.count,
    };
  }

  async listMySessions(user: AuthUser) {
    const now = new Date();
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        userId: user.sub,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        sessionId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: {
        lastUsedAt: "desc",
      },
    });

    return {
      count: rows.length,
      items: rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt ?? row.createdAt,
        expiresAt: row.expiresAt,
      })),
    };
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

  private async issueSessionToken(payload: AuthUser, options: IssueTokenOptions = {}) {
    const sessionId = options.rotateFromToken?.sessionId ?? randomUUID();
    const refreshRecord = await this.createRefreshToken(payload.sub, sessionId, options.clientMeta);

    if (options.rotateFromToken) {
      const now = new Date();
      await this.prisma.refreshToken.update({
        where: { id: options.rotateFromToken.id },
        data: {
          revokedAt: now,
          revokedReason: REVOKE_REASON.ROTATED,
          lastUsedAt: now,
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

  private async handleRevokedTokenUse(token: Pick<RefreshToken, "id" | "userId" | "replacedByTokenId" | "reuseDetectedAt" | "revokedReason">) {
    const suspiciousReuse = token.revokedReason === REVOKE_REASON.ROTATED || Boolean(token.replacedByTokenId);
    if (!suspiciousReuse) {
      return false;
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: token.id },
        data: {
          reuseDetectedAt: token.reuseDetectedAt ?? now,
          revokedReason: REVOKE_REASON.REUSE_DETECTED,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: token.userId,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
          revokedReason: REVOKE_REASON.REUSE_DETECTED,
        },
      }),
    ]);

    return true;
  }

  private async safeRevokeToken(tokenId: string, reason: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        id: tokenId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
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

  private async createRefreshToken(userId: string, sessionId: string, clientMeta?: AuthClientMeta) {
    const plain = randomBytes(64).toString("hex");
    const tokenHash = this.hashRefreshToken(plain);
    const expiresAt = new Date(Date.now() + this.resolveRefreshTokenTtlDays() * 24 * 60 * 60 * 1000);
    const now = new Date();

    const saved = await this.prisma.refreshToken.create({
      data: {
        userId,
        sessionId,
        tokenHash,
        userAgent: clientMeta?.userAgent ?? null,
        ipAddress: clientMeta?.ipAddress ?? null,
        lastUsedAt: now,
        expiresAt,
      },
      select: { id: true },
    });

    return {
      id: saved.id,
      token: plain,
    };
  }
}
