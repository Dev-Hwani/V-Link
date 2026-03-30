import { InternalServerErrorException, Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

import { SapClient } from "./sap-client.interface";
import { SapRequestPayload } from "./sap.types";

@Injectable()
export class ODataSapClient implements SapClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  sendPreStockOrder(payload: SapRequestPayload): Promise<Record<string, unknown>> {
    const endpoint = this.configService.get<string>("SAP_ODATA_PRE_ORDER_PATH") ?? "/pre-order";
    return this.post(endpoint, payload);
  }

  sendCompletionOrder(payload: SapRequestPayload): Promise<Record<string, unknown>> {
    const endpoint = this.configService.get<string>("SAP_ODATA_POST_ORDER_PATH") ?? "/post-order";
    return this.post(endpoint, payload);
  }

  private async post(endpoint: string, payload: SapRequestPayload): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>("SAP_ODATA_BASE_URL");

    if (!baseUrl) {
      return {
        mocked: true,
        endpoint,
        payload,
      };
    }

    const username = this.configService.get<string>("SAP_ODATA_USERNAME");
    const password = this.configService.get<string>("SAP_ODATA_PASSWORD");

    try {
      const response = await firstValueFrom(
        this.httpService.post<Record<string, unknown>>(`${baseUrl}${endpoint}`, payload, {
          timeout: 10000,
          auth: username && password ? { username, password } : undefined,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new InternalServerErrorException(`SAP OData call failed: ${message}`);
    }
  }
}
