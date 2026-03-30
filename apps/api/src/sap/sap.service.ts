import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, SapJobStatus, SapJobType } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { SAP_CLIENT } from "./sap.constants";
import { SapClient } from "./sap-client.interface";
import { SapRequestPayload } from "./sap.types";

@Injectable()
export class SapService {
  private readonly logger = new Logger(SapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(SAP_CLIENT) private readonly sapClient: SapClient,
  ) {}

  async enqueuePreStockOrder(requestId: string) {
    return this.execute(requestId, SapJobType.PRE_STOCK);
  }

  async enqueueCompletionOrder(requestId: string) {
    return this.execute(requestId, SapJobType.POST_COMPLETION);
  }

  private async execute(requestId: string, jobType: SapJobType) {
    const request = await this.prisma.vasRequest.findUnique({
      where: { id: requestId },
      include: {
        assignedVendor: true,
      },
    });

    if (!request) {
      throw new Error("Request not found for SAP job");
    }

    const payload: SapRequestPayload = {
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

    const log = await this.prisma.sapJobLog.create({
      data: {
        requestId,
        jobType,
        status: SapJobStatus.PENDING,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      const response =
        jobType === SapJobType.PRE_STOCK
          ? await this.sapClient.sendPreStockOrder(payload)
          : await this.sapClient.sendCompletionOrder(payload);

      await this.prisma.sapJobLog.update({
        where: { id: log.id },
        data: {
          status: SapJobStatus.SUCCESS,
          response: response as Prisma.InputJsonValue,
          runAt: new Date(),
        },
      });

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown SAP error";

      await this.prisma.sapJobLog.update({
        where: { id: log.id },
        data: {
          status: SapJobStatus.FAILED,
          errorMessage: message,
          runAt: new Date(),
        },
      });

      const alertChannel = this.configService.get<string>("SAP_ALERT_CHANNEL") ?? "log-only";
      this.logger.error(`SAP job failed (${jobType}) [channel=${alertChannel}]: ${message}`);

      return { failed: true, message };
    }
  }
}
