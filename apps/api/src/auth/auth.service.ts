import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
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

  private async issueSessionToken(payload: AuthUser) {
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: payload,
    };
  }
}
