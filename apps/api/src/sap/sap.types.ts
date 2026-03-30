import { RequestStatus, SapJobType } from "@prisma/client";

export interface SapRequestPayload {
  requestId: string;
  requestType: string;
  title: string;
  dueDate: Date;
  team: string;
  description: string | null;
  status: RequestStatus;
  vendorCode: string | null;
  vendorName: string | null;
  jobType: SapJobType;
}
