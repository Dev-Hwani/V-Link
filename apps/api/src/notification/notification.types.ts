import { RequestStatus, SapJobType } from "@prisma/client";

export interface RequestLifecycleNotificationPayload {
  event:
    | "REQUEST_CREATED"
    | "REQUEST_APPROVED"
    | "REQUEST_REJECTED"
    | "REQUEST_STARTED"
    | "REQUEST_COMPLETED";
  requestId: string;
  title: string;
  status: RequestStatus;
  team: string;
  dueDate: Date;
  targetAdminId?: string | null;
  vendorName?: string | null;
  reason?: string | null;
}

export interface SapFailureNotificationPayload {
  requestId: string;
  jobId: string;
  jobType: SapJobType;
  message: string;
  errorCode?: string | null;
  httpStatus?: number | null;
}
