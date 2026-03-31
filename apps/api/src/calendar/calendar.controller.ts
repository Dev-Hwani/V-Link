import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { CalendarEventsQueryDto } from "./dto/calendar-events-query.dto";
import { CalendarService } from "./calendar.service";

@Controller("calendar")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get("events")
  @Roles(Role.ADMIN, Role.REQUESTER, Role.VENDOR)
  events(@CurrentUser() user: AuthUser, @Query() query: CalendarEventsQueryDto) {
    return this.calendarService.getEvents(user, query);
  }

  @Get("vendors")
  @Roles(Role.ADMIN, Role.REQUESTER, Role.VENDOR)
  vendors(@CurrentUser() user: AuthUser) {
    return this.calendarService.getVendorOptions(user);
  }
}

