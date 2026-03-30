import { IsString, MaxLength, MinLength } from "class-validator";

export class RejectRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}
