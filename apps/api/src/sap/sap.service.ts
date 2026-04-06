import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, SapJobLog, SapJobStatus, SapJobType } from "@prisma/client";
import * as ExcelJS from "exceljs";

import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { SAP_CLIENT } from "./sap.constants";
import { SapClient } from "./sap-client.interface";
import { ExportSapBackupQueryDto, SapBackupFormat } from "./dto/export-sap-backup-query.dto";
import { ListSapJobsQueryDto } from "./dto/list-sap-jobs-query.dto";
import { SapIntegrationError } from "./sap.errors";
import { SapRequestPayload } from "./sap.types";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_SECONDS = 30;
const LOCK_EXPIRE_MS = 60 * 1000;

interface SapBackupRow {
  jobId: string;
  requestId: string;
  jobType: SapJobType;
  jobStatus: SapJobStatus;
  errorCode: string;
  httpStatus: string;
  errorMessage: string;
  attempts: number;
  requestType: string;
  team: string;
  vendorCode: string;
  vendorName: string;
  dueDate: string;
  runAt: string;
  payloadJson: string;
}

@Injectable()
export class SapService {
  private readonly logger = new Logger(SapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    @Inject(SAP_CLIENT) private readonly sapClient: SapClient,
  ) {}

  async enqueuePreStockOrder(requestId: string) {
    return this.enqueue(requestId, SapJobType.PRE_STOCK);
  }

  async enqueueCompletionOrder(requestId: string) {
    return this.enqueue(requestId, SapJobType.POST_COMPLETION);
  }

  async processQueuedJobs(limit = 20) {
    const now = new Date();
    const candidates = await this.prisma.sapJobLog.findMany({
      where: {
        status: {
          in: [SapJobStatus.PENDING, SapJobStatus.FAILED],
        },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
      take: limit * 3,
    });

    const jobs = candidates.filter((job) => job.attemptCount < job.maxAttempts).slice(0, limit);

    let processed = 0;

    for (const job of jobs) {
      const handled = await this.processSingleJob(job.id);
      if (handled) {
        processed += 1;
      }
    }

    return { processed };
  }

  async retryJobNow(jobId: string) {
    return this.prisma.sapJobLog.update({
      where: { id: jobId },
      data: {
        status: SapJobStatus.PENDING,
        nextRetryAt: new Date(),
        lockedAt: null,
        errorMessage: null,
        errorCode: null,
        httpStatus: null,
      },
    });
  }

  async listJobs(query: ListSapJobsQueryDto) {
    return this.prisma.sapJobLog.findMany({
      where: {
        requestId: query.requestId,
        jobType: query.jobType,
        status: query.status,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async exportBackup(query: ExportSapBackupQueryDto) {
    const format = query.format ?? SapBackupFormat.CSV;
    const where: Prisma.SapJobLogWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.jobType) {
      where.jobType = query.jobType;
    }

    if (query.requestId) {
      where.requestId = query.requestId;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const logs = await this.prisma.sapJobLog.findMany({
      where,
      include: {
        request: {
          include: {
            assignedVendor: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const rows = logs.map((log) => this.toBackupRow(log));
    const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").slice(0, 15);
    const baseName = `sap-backup-${timestamp}`;

    if (format === SapBackupFormat.XLSX) {
      const content = await this.toXlsxBuffer(rows);
      return {
        fileName: `${baseName}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content,
      };
    }

    const content = Buffer.from(this.toCsv(rows), "utf-8");
    return {
      fileName: `${baseName}.csv`,
      mimeType: "text/csv; charset=utf-8",
      content,
    };
  }

  private async enqueue(requestId: string, jobType: SapJobType) {
    const payload = await this.buildPayload(requestId, jobType);
    const maxAttempts = this.getMaxAttempts();

    return this.prisma.sapJobLog.create({
      data: {
        requestId,
        jobType,
        status: SapJobStatus.PENDING,
        payload: payload as unknown as Prisma.InputJsonValue,
        attemptCount: 0,
        maxAttempts,
        nextRetryAt: new Date(),
      },
    });
  }

  private async processSingleJob(jobId: string) {
    const lockResult = await this.prisma.sapJobLog.updateMany({
      where: {
        id: jobId,
        status: { in: [SapJobStatus.PENDING, SapJobStatus.FAILED] },
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_EXPIRE_MS) } }],
      },
      data: {
        lockedAt: new Date(),
      },
    });

    if (lockResult.count === 0) {
      return false;
    }

    const job = await this.prisma.sapJobLog.findUnique({ where: { id: jobId } });
    if (!job || job.attemptCount >= job.maxAttempts) {
      await this.releaseLock(jobId);
      return false;
    }

    const payload = job.payload as unknown as SapRequestPayload;
    const attemptedCount = job.attemptCount + 1;

    try {
      const response =
        job.jobType === SapJobType.PRE_STOCK
          ? await this.sapClient.sendPreStockOrder(payload)
          : await this.sapClient.sendCompletionOrder(payload);

      await this.prisma.sapJobLog.update({
        where: { id: job.id },
        data: {
          status: SapJobStatus.SUCCESS,
          response: response as Prisma.InputJsonValue,
          attemptCount: attemptedCount,
          lastTriedAt: new Date(),
          runAt: new Date(),
          nextRetryAt: null,
          lockedAt: null,
          errorMessage: null,
          errorCode: null,
          httpStatus: null,
        },
      });

      return true;
    } catch (error) {
      const normalized = this.normalizeSapError(error);
      const exhausted = attemptedCount >= job.maxAttempts || !normalized.retryable;
      const nextRetryAt = exhausted ? null : new Date(Date.now() + this.getRetryDelayMs(attemptedCount));

      await this.prisma.sapJobLog.update({
        where: { id: job.id },
        data: {
          status: SapJobStatus.FAILED,
          errorMessage: normalized.message,
          errorCode: normalized.errorCode,
          httpStatus: normalized.httpStatus,
          attemptCount: attemptedCount,
          lastTriedAt: new Date(),
          runAt: new Date(),
          nextRetryAt,
          lockedAt: null,
        },
      });

      if (exhausted) {
        await this.sendFailureAlert(job, payload, normalized.message, normalized.errorCode, normalized.httpStatus);
      }

      return true;
    }
  }

  private async buildPayload(requestId: string, jobType: SapJobType): Promise<SapRequestPayload> {
    const request = await this.prisma.vasRequest.findUnique({
      where: { id: requestId },
      include: {
        assignedVendor: true,
      },
    });

    if (!request) {
      throw new Error("Request not found for SAP job");
    }

    return {
      requestId: request.id,
      requestType: request.requestType,
      title: request.title,
      dueDate: request.dueDate,
      team: request.team,
      description: request.description,
      status: request.status,
      vendorCode: request.assignedVendor?.code ?? null,
      vendorName: request.assignedVendor?.name ?? null,
      jobType,
    };
  }

  private async sendFailureAlert(
    job: SapJobLog,
    payload: SapRequestPayload,
    message: string,
    errorCode: string | null,
    httpStatus: number | null,
  ) {
    const alertChannel = this.configService.get<string>("SAP_ALERT_CHANNEL") ?? "log-only";
    this.logger.error(`SAP job failed (${job.jobType}) [channel=${alertChannel}]: ${message}`);

    await this.notificationService.notifySapFailure({
      requestId: job.requestId,
      jobId: job.id,
      jobType: job.jobType,
      message,
      errorCode,
      httpStatus,
    });

    const webhookUrl = this.configService.get<string>("SAP_ALERT_WEBHOOK_URL");
    if (!webhookUrl) {
      return;
    }

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "v-link-sap",
          severity: "error",
          jobId: job.id,
          requestId: job.requestId,
          jobType: job.jobType,
          attempts: job.maxAttempts,
          message,
          payload,
        }),
      });
    } catch (error) {
      const webhookError = error instanceof Error ? error.message : "Unknown webhook error";
      this.logger.error(`Failed to send SAP alert webhook: ${webhookError}`);
    }
  }

  private normalizeSapError(error: unknown) {
    if (error instanceof SapIntegrationError) {
      return {
        message: error.message,
        retryable: error.retryable,
        errorCode: error.errorCode ?? null,
        httpStatus: error.httpStatus ?? null,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        retryable: true,
        errorCode: null,
        httpStatus: null,
      };
    }

    return {
      message: "Unknown SAP error",
      retryable: true,
      errorCode: null,
      httpStatus: null,
    };
  }

  private getMaxAttempts() {
    const value = Number(this.configService.get<string>("SAP_MAX_RETRY_ATTEMPTS") ?? DEFAULT_MAX_ATTEMPTS);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_ATTEMPTS;
  }

  private getRetryDelayMs(attemptedCount: number) {
    const baseSeconds = Number(
      this.configService.get<string>("SAP_RETRY_BASE_SECONDS") ?? DEFAULT_RETRY_BASE_SECONDS,
    );
    const safeBase = Number.isFinite(baseSeconds) && baseSeconds > 0 ? baseSeconds : DEFAULT_RETRY_BASE_SECONDS;
    return safeBase * 1000 * Math.pow(2, Math.max(0, attemptedCount - 1));
  }

  private async releaseLock(jobId: string) {
    await this.prisma.sapJobLog.update({
      where: { id: jobId },
      data: {
        lockedAt: null,
      },
    });
  }

  private toBackupRow(log: SapJobLog & { request: { requestType: string; team: string; dueDate: Date; assignedVendor: { code: string; name: string } | null } }) {
    return {
      jobId: log.id,
      requestId: log.requestId,
      jobType: log.jobType,
      jobStatus: log.status,
      errorCode: log.errorCode ?? "",
      httpStatus: log.httpStatus !== null ? String(log.httpStatus) : "",
      errorMessage: log.errorMessage ?? "",
      attempts: log.attemptCount,
      requestType: log.request.requestType,
      team: log.request.team,
      vendorCode: log.request.assignedVendor?.code ?? "",
      vendorName: log.request.assignedVendor?.name ?? "",
      dueDate: log.request.dueDate.toISOString(),
      runAt: log.runAt ? log.runAt.toISOString() : "",
      payloadJson: JSON.stringify(log.payload),
    };
  }

  private toCsv(rows: SapBackupRow[]) {
    const header = [
      "jobId",
      "requestId",
      "jobType",
      "jobStatus",
      "errorCode",
      "httpStatus",
      "errorMessage",
      "attempts",
      "requestType",
      "team",
      "vendorCode",
      "vendorName",
      "dueDate",
      "runAt",
      "payloadJson",
    ];

    const body = rows.map((row) =>
      [
        row.jobId,
        row.requestId,
        row.jobType,
        row.jobStatus,
        row.errorCode,
        row.httpStatus,
        row.errorMessage,
        String(row.attempts),
        row.requestType,
        row.team,
        row.vendorCode,
        row.vendorName,
        row.dueDate,
        row.runAt,
        row.payloadJson,
      ]
        .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
        .join(","),
    );

    return `${header.join(",")}\n${body.join("\n")}`;
  }

  private async toXlsxBuffer(rows: SapBackupRow[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("sap-backup");

    sheet.columns = [
      { header: "jobId", key: "jobId", width: 38 },
      { header: "requestId", key: "requestId", width: 38 },
      { header: "jobType", key: "jobType", width: 20 },
      { header: "jobStatus", key: "jobStatus", width: 16 },
      { header: "errorCode", key: "errorCode", width: 20 },
      { header: "httpStatus", key: "httpStatus", width: 12 },
      { header: "errorMessage", key: "errorMessage", width: 40 },
      { header: "attempts", key: "attempts", width: 10 },
      { header: "requestType", key: "requestType", width: 20 },
      { header: "team", key: "team", width: 20 },
      { header: "vendorCode", key: "vendorCode", width: 20 },
      { header: "vendorName", key: "vendorName", width: 24 },
      { header: "dueDate", key: "dueDate", width: 28 },
      { header: "runAt", key: "runAt", width: 28 },
      { header: "payloadJson", key: "payloadJson", width: 80 },
    ];

    rows.forEach((row) => {
      sheet.addRow(row);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  }
}
