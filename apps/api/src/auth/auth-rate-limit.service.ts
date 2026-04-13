import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

interface RateBucket {
  count: number;
  resetAtMs: number;
}

@Injectable()
export class AuthRateLimitService {
  private readonly buckets = new Map<string, RateBucket>();

  constructor(private readonly configService: ConfigService) {}

  consumeLogin(request: Request) {
    const max = this.readPositiveInt("AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 10);
    const windowSeconds = this.readPositiveInt("AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS", 60);
    const key = this.buildRateKey(request, "login");

    this.consumeOrThrow(key, max, windowSeconds, "Too many login attempts. Please try again later.");
  }

  consumeSignup(request: Request) {
    const max = this.readPositiveInt("AUTH_SIGNUP_RATE_LIMIT_MAX_ATTEMPTS", 5);
    const windowSeconds = this.readPositiveInt("AUTH_SIGNUP_RATE_LIMIT_WINDOW_SECONDS", 300);
    const key = this.buildRateKey(request, "signup");

    this.consumeOrThrow(key, max, windowSeconds, "Too many signup attempts. Please try again later.");
  }

  private consumeOrThrow(key: string, maxAttempts: number, windowSeconds: number, message: string) {
    const now = Date.now();
    const existing = this.buckets.get(key);
    const resetAtMs = now + windowSeconds * 1000;

    if (!existing || now >= existing.resetAtMs) {
      this.buckets.set(key, {
        count: 1,
        resetAtMs,
      });
      this.compactMapIfNeeded(now);
      return;
    }

    existing.count += 1;
    this.buckets.set(key, existing);
    if (existing.count > maxAttempts) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    this.compactMapIfNeeded(now);
  }

  private compactMapIfNeeded(nowMs: number) {
    if (this.buckets.size < 1500) {
      return;
    }

    for (const [key, bucket] of this.buckets.entries()) {
      if (nowMs >= bucket.resetAtMs) {
        this.buckets.delete(key);
      }
    }
  }

  private buildRateKey(request: Request, action: string, extra = "") {
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedIp =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]?.trim()
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]?.trim()
          : "";
    const ip = forwardedIp || request.ip || "unknown-ip";
    return `${action}:${ip}:${extra}`;
  }

  private readPositiveInt(key: string, fallback: number) {
    const raw = this.configService.get<string>(key) ?? "";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
