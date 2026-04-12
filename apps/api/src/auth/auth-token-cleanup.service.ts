import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthTokenCleanupService {
  private readonly logger = new Logger(AuthTokenCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupRefreshTokens() {
    const now = new Date();
    const revokedRetentionDays = this.resolveRevokedRetentionDays();
    const revokedBefore = new Date(now.getTime() - revokedRetentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          {
            revokedAt: {
              not: null,
              lt: revokedBefore,
            },
          },
        ],
      },
    });

    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} stale refresh tokens`);
    }
  }

  private resolveRevokedRetentionDays() {
    const raw = this.configService.get<string>("REFRESH_TOKEN_REVOKED_RETENTION_DAYS") ?? "30";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 30;
    }
    return Math.floor(parsed);
  }
}
