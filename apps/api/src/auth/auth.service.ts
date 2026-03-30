import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcrypt";

import { AuthUser } from "../common/interfaces/auth-user.interface";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

    const payload: AuthUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendorId ?? null,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: payload,
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
}
