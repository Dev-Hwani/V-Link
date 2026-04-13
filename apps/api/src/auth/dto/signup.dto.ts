import { Role } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from "class-validator";

import { PASSWORD_POLICY_MESSAGE } from "../auth-password-policy";

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: PASSWORD_POLICY_MESSAGE,
  })
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
