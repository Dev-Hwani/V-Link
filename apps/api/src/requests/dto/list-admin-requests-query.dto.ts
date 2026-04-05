import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { RequestStatus } from "@prisma/client";

export class ListAdminRequestsQueryDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsUUID()
  requesterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}

