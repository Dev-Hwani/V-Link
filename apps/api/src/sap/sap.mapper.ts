import { SapRequestPayload } from "./sap.types";

function toSapDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function mapPreStockOrderPayload(payload: SapRequestPayload) {
  return {
    RequestId: payload.requestId,
    RequestType: payload.requestType,
    Title: payload.title,
    DueDate: toSapDate(payload.dueDate),
    Team: payload.team,
    Description: payload.description ?? "",
    VendorCode: payload.vendorCode ?? "",
    VendorName: payload.vendorName ?? "",
    Stage: "PRE_STOCK",
  };
}

export function mapCompletionOrderPayload(payload: SapRequestPayload) {
  return {
    RequestId: payload.requestId,
    RequestType: payload.requestType,
    Title: payload.title,
    DueDate: toSapDate(payload.dueDate),
    Team: payload.team,
    Description: payload.description ?? "",
    VendorCode: payload.vendorCode ?? "",
    VendorName: payload.vendorName ?? "",
    Stage: "POST_COMPLETION",
  };
}

