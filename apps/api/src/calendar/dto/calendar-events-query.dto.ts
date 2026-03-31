import { RequestStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";

export class CalendarEventsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}

