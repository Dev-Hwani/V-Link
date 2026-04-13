import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { AuthController } from "./auth.controller";
import { AuthTokenCleanupService } from "./auth-token-cleanup.service";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const hours = Number(configService.get<string>("ACCESS_TOKEN_EXPIRES_HOURS") ?? "12");
        const normalizedHours = Number.isFinite(hours) && hours > 0 ? Math.floor(hours) : 12;

        return {
          secret: configService.get<string>("JWT_SECRET") ?? "dev-secret",
          signOptions: {
            expiresIn: `${normalizedHours}h`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthTokenCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
