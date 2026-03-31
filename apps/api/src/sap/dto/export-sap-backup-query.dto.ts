import { SapJobStatus, SapJobType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";

export enum SapBackupFormat {
  CSV = "csv",
  XLSX = "xlsx",
}

export class ExportSapBackupQueryDto {
  @IsOptional()
  @IsEnum(SapBackupFormat)
  format?: SapBackupFormat;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(SapJobStatus)
  status?: SapJobStatus;

  @IsOptional()
  @IsEnum(SapJobType)
  jobType?: SapJobType;

  @IsOptional()
  @IsUUID()
  requestId?: string;
}

