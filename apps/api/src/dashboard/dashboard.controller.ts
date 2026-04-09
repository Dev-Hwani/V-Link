import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Response } from "express";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
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
  summary(@Query() query: DashboardSummaryQueryDto) {
    return this.dashboardService.getSummary(query);
  }

  @Get("detail-table")
  @Roles(Role.ADMIN)
  detailTable(@Query() query: DashboardDetailTableQueryDto) {
    return this.dashboardService.getDetailTable(query);
  }

  @Get("export")
  @Roles(Role.ADMIN)
  async exportDashboard(@Query() query: DashboardExportQueryDto, @Res() res: Response) {
    const file = await this.dashboardService.exportDashboard(query);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename=\"${file.fileName}\"`);
    res.send(file.content);
  }
}
