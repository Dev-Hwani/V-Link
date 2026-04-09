import { Type } from "class-transformer";
import { RequestStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

import { DashboardSummaryQueryDto } from "./dashboard-summary-query.dto";

export class DashboardDetailTableQueryDto extends DashboardSummaryQueryDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}

