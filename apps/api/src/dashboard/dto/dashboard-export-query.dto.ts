import { IsEnum, IsOptional } from "class-validator";

import { DashboardDetailTableQueryDto } from "./dashboard-detail-table-query.dto";

export enum DashboardExportFormat {
  CSV = "csv",
  XLSX = "xlsx",
}

export class DashboardExportQueryDto extends DashboardDetailTableQueryDto {
  @IsOptional()
  @IsEnum(DashboardExportFormat)
  format?: DashboardExportFormat;
}

