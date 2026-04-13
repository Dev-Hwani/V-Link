import { BadRequestException } from "@nestjs/common";

const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.";

export function assertPasswordPolicy(password: string) {
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}

