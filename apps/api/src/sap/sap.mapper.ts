import { SapRequestPayload } from "./sap.types";

export interface SapMappingOptions {
  companyCode: string;
  plantCode: string;
  storageLocation: string;
  currency: string;
  preOrderType: string;
  postOrderType: string;
  requestTypeMap: Record<string, string>;
}

function toSapDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function mapBaseFields(payload: SapRequestPayload, options: SapMappingOptions) {
  const materialCode = options.requestTypeMap[payload.requestType] ?? payload.requestType;

  return {
    ExternalRequestId: payload.requestId,
    CompanyCode: options.companyCode,
    Plant: options.plantCode,
    StorageLocation: options.storageLocation,
    Currency: options.currency,
    MaterialCode: materialCode,
    RequestType: payload.requestType,
    Title: payload.title,
    DueDate: toSapDate(payload.dueDate),
    Team: payload.team,
    Description: payload.description ?? "",
    VendorCode: payload.vendorCode ?? "",
    VendorName: payload.vendorName ?? "",
  };
}

export function mapPreStockOrderPayload(payload: SapRequestPayload, options: SapMappingOptions) {
  return {
    ...mapBaseFields(payload, options),
    OrderType: options.preOrderType,
    Stage: "PRE_STOCK",
    Action: "RESERVE_STOCK",
  };
}

export function mapCompletionOrderPayload(payload: SapRequestPayload, options: SapMappingOptions) {
  return {
    ...mapBaseFields(payload, options),
    OrderType: options.postOrderType,
    Stage: "POST_COMPLETION",
    Action: "POST_COMPLETION",
  };
}

