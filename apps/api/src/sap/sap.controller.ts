import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { ListSapJobsQueryDto } from "./dto/list-sap-jobs-query.dto";
import { SapService } from "./sap.service";

@Controller("sap")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SapController {
  constructor(private readonly sapService: SapService) {}

  @Get("jobs")
  listJobs(@Query() query: ListSapJobsQueryDto) {
    return this.sapService.listJobs(query);
  }

  @Post("jobs/:id/retry")
  retryJob(@Param("id", ParseUUIDPipe) id: string) {
    return this.sapService.retryJobNow(id);
  }
}

