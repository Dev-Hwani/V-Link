import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateRequestDto {
  @IsString()
  @MaxLength(100)
  requestType!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsDateString()
  dueDate!: string;

  @IsString()
  @MaxLength(120)
  team!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
