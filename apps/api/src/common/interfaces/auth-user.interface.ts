import { Role } from "@prisma/client";

export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
  vendorId: string | null;
}
