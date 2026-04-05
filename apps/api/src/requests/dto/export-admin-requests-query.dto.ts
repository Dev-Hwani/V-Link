import { IsEnum, IsOptional } from "class-validator";

import { ListAdminRequestsQueryDto } from "./list-admin-requests-query.dto";

export enum AdminRequestExportFormat {
  CSV = "csv",
  XLSX = "xlsx",
}

export class ExportAdminRequestsQueryDto extends ListAdminRequestsQueryDto {
  @IsOptional()
  @IsEnum(AdminRequestExportFormat)
  format?: AdminRequestExportFormat;
}

