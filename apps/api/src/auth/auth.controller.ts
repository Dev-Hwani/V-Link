import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Request } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { SignupDto } from "./dto/signup.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Req() request: Request, @Body() dto: LoginDto) {
    return this.authService.login(dto, this.extractClientMeta(request));
  }

  @Post("signup")
  signup(@Req() request: Request, @Body() dto: SignupDto) {
    return this.authService.signupRequester(dto, this.extractClientMeta(request));
  }

  @Post("refresh")
  refresh(@Req() request: Request, @Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto, this.extractClientMeta(request));
  }

  @Post("logout")
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listMySessions(user);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.logoutAll(user);
  }

  @Post("register")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDto) {
    return this.authService.register(user, dto);
  }

  private extractClientMeta(request: Request) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedIp =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]?.trim()
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]?.trim()
          : null;
    const ipAddress = forwardedIp || request.ip || null;

    const userAgentHeader = request.headers["user-agent"];
    const userAgent =
      typeof userAgentHeader === "string"
        ? userAgentHeader
        : Array.isArray(userAgentHeader)
          ? userAgentHeader[0] ?? null
          : null;

    return {
      ipAddress,
      userAgent,
    };
  }
}
