import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./auth/auth.module";
import { CalendarModule } from "./calendar/calendar.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RequestsModule } from "./requests/requests.module";
import { SapModule } from "./sap/sap.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CalendarModule,
    RequestsModule,
    SapModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
