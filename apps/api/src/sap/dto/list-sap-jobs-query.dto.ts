import { SapJobStatus, SapJobType } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class ListSapJobsQueryDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsEnum(SapJobType)
  jobType?: SapJobType;

  @IsOptional()
  @IsEnum(SapJobStatus)
  status?: SapJobStatus;
}

