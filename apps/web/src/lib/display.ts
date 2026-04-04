import type { UserRole } from "./session";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED";
export type SapStatus = "PENDING" | "SUCCESS" | "FAILED";

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "관리자",
  REQUESTER: "요청자",
  VENDOR: "업체",
};

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
};

const SAP_STATUS_LABEL: Record<SapStatus, string> = {
  PENDING: "대기",
  SUCCESS: "성공",
  FAILED: "실패",
};

const REQUEST_TYPE_LABEL: Record<string, string> = {
  LABELING: "라벨링",
  REPACK: "재포장",
};

export function roleLabel(role: UserRole) {
  return ROLE_LABEL[role];
}

export function requestStatusLabel(status: string) {
  return REQUEST_STATUS_LABEL[status as RequestStatus] ?? status;
}

export function sapStatusLabel(status: string) {
  return SAP_STATUS_LABEL[status as SapStatus] ?? status;
}

export function requestTypeLabel(requestType: string) {
  return REQUEST_TYPE_LABEL[requestType] ?? requestType;
}
