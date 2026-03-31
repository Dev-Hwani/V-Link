import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosError, AxiosRequestConfig } from "axios";
import { firstValueFrom } from "rxjs";

import { SapClient } from "./sap-client.interface";
import { SapIntegrationError } from "./sap.errors";
import {
  mapCompletionOrderPayload,
  mapPreStockOrderPayload,
  SapMappingOptions,
} from "./sap.mapper";
import { SapRequestPayload } from "./sap.types";

type SapAuthMode = "NONE" | "BASIC" | "BEARER" | "CLIENT_CREDENTIALS";

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

@Injectable()
export class ODataSapClient implements SapClient {
  private accessTokenCache: AccessTokenCache | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  sendPreStockOrder(payload: SapRequestPayload): Promise<Record<string, unknown>> {
    const endpoint = this.configService.get<string>("SAP_ODATA_PRE_ORDER_PATH") ?? "/pre-order";
    return this.post(endpoint, mapPreStockOrderPayload(payload, this.getMappingOptions()));
  }

  sendCompletionOrder(payload: SapRequestPayload): Promise<Record<string, unknown>> {
    const endpoint = this.configService.get<string>("SAP_ODATA_POST_ORDER_PATH") ?? "/post-order";
    return this.post(endpoint, mapCompletionOrderPayload(payload, this.getMappingOptions()));
  }

  private async post(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const baseUrl = this.configService.get<string>("SAP_ODATA_BASE_URL");

    if (!baseUrl) {
      return {
        mocked: true,
        endpoint,
        payload,
      };
    }

    const url = `${baseUrl}${endpoint}`;
    const headers = await this.buildAuthHeaders();

    const config: AxiosRequestConfig = {
      timeout: this.getTimeoutMs(),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      auth: this.getBasicAuth(),
    };

    try {
      const response = await firstValueFrom(this.httpService.post<Record<string, unknown>>(url, payload, config));
      const normalizedError = this.readSapBusinessError(response.data, endpoint);
      if (normalizedError) {
        throw normalizedError;
      }
      return response.data;
    } catch (error) {
      throw this.normalizeClientError(error, endpoint);
    }
  }

  private readSapBusinessError(body: unknown, endpoint: string): SapIntegrationError | null {
    if (!body || typeof body !== "object") {
      return null;
    }

    const payload = body as Record<string, unknown>;
    const error = payload.error as Record<string, unknown> | undefined;
    if (!error) {
      return null;
    }

    const errorCode = typeof error.code === "string" ? error.code : undefined;
    const messageNode = error.message as Record<string, unknown> | string | undefined;
    const message =
      typeof messageNode === "string"
        ? messageNode
        : typeof messageNode?.value === "string"
          ? messageNode.value
          : "SAP business error";

    return new SapIntegrationError(message, {
      endpoint,
      errorCode,
      httpStatus: 200,
      retryable: !this.isExplicitNonRetryableCode(errorCode),
      responseBody: payload,
    });
  }

  private normalizeClientError(error: unknown, endpoint: string): SapIntegrationError {
    if (error instanceof SapIntegrationError) {
      return error;
    }

    if (error instanceof AxiosError) {
      const status = error.response?.status ?? null;
      const responseBody = error.response?.data;
      const parsed = this.extractODataError(responseBody);
      const fallbackCode = error.code ?? undefined;
      const errorCode = parsed.errorCode ?? fallbackCode ?? null;
      const message = parsed.message ?? error.message ?? "SAP OData call failed";
      const retryable = this.isRetryable(status, errorCode, error.code);

      return new SapIntegrationError(message, {
        endpoint,
        errorCode,
        httpStatus: status,
        retryable,
        responseBody,
      });
    }

    const message = error instanceof Error ? error.message : "Unknown SAP client error";
    return new SapIntegrationError(message, {
      endpoint,
      errorCode: null,
      httpStatus: null,
      retryable: true,
    });
  }

  private extractODataError(responseBody: unknown): { errorCode?: string; message?: string } {
    if (!responseBody || typeof responseBody !== "object") {
      return {};
    }

    const payload = responseBody as Record<string, unknown>;
    const error = payload.error as Record<string, unknown> | undefined;
    if (!error) {
      return {};
    }

    const errorCode = typeof error.code === "string" ? error.code : undefined;
    const messageNode = error.message as Record<string, unknown> | string | undefined;
    const message =
      typeof messageNode === "string"
        ? messageNode
        : typeof messageNode?.value === "string"
          ? messageNode.value
          : undefined;

    return { errorCode, message };
  }

  private isRetryable(httpStatus: number | null, errorCode: string | null, transportCode?: string) {
    if (this.isExplicitNonRetryableCode(errorCode)) {
      return false;
    }

    if (this.isExplicitRetryableCode(errorCode)) {
      return true;
    }

    if (transportCode && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(transportCode)) {
      return true;
    }

    if (httpStatus === null) {
      return true;
    }

    if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429) {
      return true;
    }

    if (httpStatus >= 500) {
      return true;
    }

    return false;
  }

  private isExplicitNonRetryableCode(errorCode: string | null | undefined) {
    if (!errorCode) {
      return false;
    }

    const raw = this.configService.get<string>("SAP_NON_RETRYABLE_CODES") ?? "";
    const list = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return list.includes(errorCode);
  }

  private isExplicitRetryableCode(errorCode: string | null | undefined) {
    if (!errorCode) {
      return false;
    }

    const raw = this.configService.get<string>("SAP_RETRYABLE_CODES") ?? "";
    const list = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return list.includes(errorCode);
  }

  private getMappingOptions(): SapMappingOptions {
    return {
      companyCode: this.configService.get<string>("SAP_COMPANY_CODE") ?? "1000",
      plantCode: this.configService.get<string>("SAP_PLANT_CODE") ?? "PL01",
      storageLocation: this.configService.get<string>("SAP_STORAGE_LOCATION") ?? "SL01",
      currency: this.configService.get<string>("SAP_CURRENCY") ?? "KRW",
      preOrderType: this.configService.get<string>("SAP_PRE_ORDER_TYPE") ?? "ZPRE",
      postOrderType: this.configService.get<string>("SAP_POST_ORDER_TYPE") ?? "ZPST",
      requestTypeMap: this.parseRequestTypeMap(),
    };
  }

  private parseRequestTypeMap() {
    const raw = this.configService.get<string>("SAP_REQUEST_TYPE_MAP_JSON") ?? "{}";
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === "string") {
          acc[key] = value;
        }
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  private getTimeoutMs() {
    const value = Number(this.configService.get<string>("SAP_ODATA_TIMEOUT_MS") ?? "10000");
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10000;
  }

  private getAuthMode(): SapAuthMode {
    const raw = (this.configService.get<string>("SAP_ODATA_AUTH_MODE") ?? "BASIC").toUpperCase();
    if (raw === "NONE" || raw === "BASIC" || raw === "BEARER" || raw === "CLIENT_CREDENTIALS") {
      return raw;
    }
    return "BASIC";
  }

  private getBasicAuth() {
    const mode = this.getAuthMode();
    if (mode !== "BASIC") {
      return undefined;
    }

    const username = this.configService.get<string>("SAP_ODATA_USERNAME");
    const password = this.configService.get<string>("SAP_ODATA_PASSWORD");
    return username && password ? { username, password } : undefined;
  }

  private async buildAuthHeaders() {
    const mode = this.getAuthMode();

    if (mode === "NONE" || mode === "BASIC") {
      return {};
    }

    if (mode === "BEARER") {
      const token = this.configService.get<string>("SAP_ODATA_BEARER_TOKEN");
      if (!token) {
        throw new SapIntegrationError("SAP bearer token is missing", {
          retryable: false,
          errorCode: "SAP_AUTH_MISSING_TOKEN",
          httpStatus: null,
        });
      }
      return { Authorization: `Bearer ${token}` };
    }

    const accessToken = await this.getClientCredentialsToken();
    return { Authorization: `Bearer ${accessToken}` };
  }

  private async getClientCredentialsToken() {
    const now = Date.now();
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now + 10_000) {
      return this.accessTokenCache.token;
    }

    const tokenUrl = this.configService.get<string>("SAP_ODATA_TOKEN_URL");
    const clientId = this.configService.get<string>("SAP_ODATA_CLIENT_ID");
    const clientSecret = this.configService.get<string>("SAP_ODATA_CLIENT_SECRET");
    const scope = this.configService.get<string>("SAP_ODATA_SCOPE");

    if (!tokenUrl || !clientId || !clientSecret) {
      throw new SapIntegrationError("SAP OAuth client credentials are not configured", {
        retryable: false,
        errorCode: "SAP_AUTH_CONFIG_MISSING",
        httpStatus: null,
      });
    }

    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    if (scope) {
      form.set("scope", scope);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<Record<string, unknown>>(tokenUrl, form.toString(), {
          timeout: this.getTimeoutMs(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          auth: { username: clientId, password: clientSecret },
        }),
      );

      const accessToken =
        typeof response.data.access_token === "string" ? response.data.access_token : null;
      const expiresIn =
        typeof response.data.expires_in === "number" ? response.data.expires_in : 3600;

      if (!accessToken) {
        throw new SapIntegrationError("SAP OAuth token response is missing access_token", {
          retryable: false,
          errorCode: "SAP_AUTH_TOKEN_INVALID",
          httpStatus: 200,
          responseBody: response.data,
        });
      }

      this.accessTokenCache = {
        token: accessToken,
        expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
      };

      return accessToken;
    } catch (error) {
      throw this.normalizeClientError(error, "oauth-token");
    }
  }
}

