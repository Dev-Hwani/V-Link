import { SapRequestPayload } from "./sap.types";

export interface SapClient {
  sendPreStockOrder(payload: SapRequestPayload): Promise<Record<string, unknown>>;
  sendCompletionOrder(payload: SapRequestPayload): Promise<Record<string, unknown>>;
}
