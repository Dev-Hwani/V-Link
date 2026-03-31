import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, SapJobLog, SapJobStatus, SapJobType } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { SAP_CLIENT } from "./sap.constants";
import { SapClient } from "./sap-client.interface";
import { ListSapJobsQueryDto } from "./dto/list-sap-jobs-query.dto";
import { SapIntegrationError } from "./sap.errors";
import { SapRequestPayload } from "./sap.types";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_SECONDS = 30;
const LOCK_EXPIRE_MS = 60 * 1000;

@Injectable()
export class SapService {
  private readonly logger = new Logger(SapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
        await this.sendFailureAlert(job, payload, normalized.message);
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

  private async sendFailureAlert(job: SapJobLog, payload: SapRequestPayload, message: string) {
    const alertChannel = this.configService.get<string>("SAP_ALERT_CHANNEL") ?? "log-only";
    this.logger.error(`SAP job failed (${job.jobType}) [channel=${alertChannel}]: ${message}`);

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
}
