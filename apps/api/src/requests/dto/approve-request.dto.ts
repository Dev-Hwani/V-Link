import { IsUUID } from "class-validator";

export class ApproveRequestDto {
  @IsUUID()
  vendorId!: string;
}
