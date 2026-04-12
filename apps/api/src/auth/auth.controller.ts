import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Role } from "@prisma/client";
import { randomBytes } from "crypto";
import { Request, Response } from "express";

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

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const CSRF_TOKEN_COOKIE = "csrf_token";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post("login")
  async login(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() dto: LoginDto) {
    const issued = await this.authService.login(dto, this.extractClientMeta(request));
    this.writeAuthCookies(response, issued.accessToken, issued.refreshToken);
    return { user: issued.user };
  }

  @Post("signup")
  async signup(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() dto: SignupDto) {
    const issued = await this.authService.signupRequester(dto, this.extractClientMeta(request));
    this.writeAuthCookies(response, issued.accessToken, issued.refreshToken);
    return { user: issued.user };
  }

  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: RefreshTokenDto,
  ) {
    const refreshToken = this.resolveRefreshToken(request, dto?.refreshToken);
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is missing");
    }

    const issued = await this.authService.refresh({ refreshToken }, this.extractClientMeta(request));
    this.writeAuthCookies(response, issued.accessToken, issued.refreshToken);
    return { user: issued.user };
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() dto: LogoutDto) {
    const refreshToken = this.resolveRefreshToken(request, dto?.refreshToken);
    if (refreshToken) {
      await this.authService.logout({ refreshToken });
    }

    this.clearAuthCookies(response);
    return { success: true };
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listMySessions(user);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.logoutAll(user);
    this.clearAuthCookies(response);
    return result;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Post("register")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDto) {
    return this.authService.register(user, dto);
  }

  private resolveRefreshToken(request: Request, bodyToken?: string) {
    if (bodyToken && bodyToken.trim()) {
      return bodyToken;
    }

    const cookieToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof cookieToken === "string" && cookieToken.trim()) {
      return cookieToken;
    }

    return null;
  }

  private writeAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    const accessHours = this.resolveAccessTokenExpiresHours();
    const refreshDays = this.resolveRefreshTokenExpiresDays();
    const csrfToken = randomBytes(32).toString("hex");

    response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...this.baseCookieOptions(true),
      maxAge: accessHours * 60 * 60 * 1000,
    });

    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.baseCookieOptions(true),
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });

    response.cookie(CSRF_TOKEN_COOKIE, csrfToken, {
      ...this.baseCookieOptions(false),
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(response: Response) {
    const options = this.baseCookieOptions(true);
    response.clearCookie(ACCESS_TOKEN_COOKIE, options);
    response.clearCookie(REFRESH_TOKEN_COOKIE, options);
    response.clearCookie(CSRF_TOKEN_COOKIE, this.baseCookieOptions(false));
  }

  private baseCookieOptions(httpOnly: boolean) {
    const domain = this.configService.get<string>("AUTH_COOKIE_DOMAIN")?.trim() || undefined;

    return {
      httpOnly,
      secure: this.resolveCookieSecure(),
      sameSite: this.resolveCookieSameSite(),
      domain,
      path: "/",
    } as const;
  }

  private resolveCookieSecure() {
    const raw = (this.configService.get<string>("AUTH_COOKIE_SECURE") ?? "").toLowerCase();
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
    return process.env.NODE_ENV === "production";
  }

  private resolveCookieSameSite() {
    const raw = (this.configService.get<string>("AUTH_COOKIE_SAME_SITE") ?? "lax").toLowerCase();
    if (raw === "strict" || raw === "none") {
      return raw;
    }
    return "lax";
  }

  private resolveAccessTokenExpiresHours() {
    const raw = this.configService.get<string>("ACCESS_TOKEN_EXPIRES_HOURS") ?? "12";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 12;
    }
    return Math.floor(parsed);
  }

  private resolveRefreshTokenExpiresDays() {
    const raw = this.configService.get<string>("REFRESH_TOKEN_EXPIRES_DAYS") ?? "14";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 14;
    }
    return Math.floor(parsed);
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
