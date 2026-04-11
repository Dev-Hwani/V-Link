import { IsString, MinLength } from "class-validator";

export class LogoutDto {
  @IsString()
  @MinLength(40)
  refreshToken!: string;
}
