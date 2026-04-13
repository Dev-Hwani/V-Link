import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MinLength } from "class-validator";
import { Role } from "@prisma/client";

import { PASSWORD_POLICY_MESSAGE } from "../auth-password-policy";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: PASSWORD_POLICY_MESSAGE,
  })
  password!: string;

  @IsString()
  name!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
