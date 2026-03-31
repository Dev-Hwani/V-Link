import { IsDateString, IsOptional } from "class-validator";

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

