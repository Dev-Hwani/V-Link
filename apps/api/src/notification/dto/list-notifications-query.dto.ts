import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    if (typeof value === "boolean") {
      return value;
    }
    return String(value).toLowerCase() === "true";
  })
  @IsBoolean()
  unreadOnly?: boolean;
}
