import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Response } from "express";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { DashboardDetailTableQueryDto } from "./dto/dashboard-detail-table-query.dto";
import { DashboardExportQueryDto } from "./dto/dashboard-export-query.dto";
import { DashboardSummaryQueryDto } from "./dto/dashboard-summary-query.dto";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  @Roles(Role.ADMIN)
  summary(@CurrentUser() user: AuthUser, @Query() query: DashboardSummaryQueryDto) {
    return this.dashboardService.getSummary(user.sub, query);
  }

  @Get("detail-table")
  @Roles(Role.ADMIN)
  detailTable(@CurrentUser() user: AuthUser, @Query() query: DashboardDetailTableQueryDto) {
    return this.dashboardService.getDetailTable(user.sub, query);
  }

  @Get("export")
  @Roles(Role.ADMIN)
  async exportDashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardExportQueryDto, @Res() res: Response) {
    const file = await this.dashboardService.exportDashboard(user.sub, query);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename=\"${file.fileName}\"`);
    res.send(file.content);
  }
}
