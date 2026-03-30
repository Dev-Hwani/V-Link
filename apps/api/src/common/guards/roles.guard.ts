import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@prisma/client";

import { ROLES_KEY } from "../constants/roles.constant";
import { AuthUser } from "../interfaces/auth-user.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    return Boolean(user && requiredRoles.includes(user.role));
  }
}
