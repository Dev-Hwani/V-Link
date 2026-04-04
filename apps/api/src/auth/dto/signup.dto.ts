import { Role } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  vendorCode?: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  adminSignupCode?: string;
}
