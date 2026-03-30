import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("register")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDto) {
    return this.authService.register(user, dto);
  }
}
