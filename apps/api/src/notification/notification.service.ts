import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, RequestStatus, Role } from "@prisma/client";
import nodemailer, { Transporter } from "nodemailer";

import { PrismaService } from "../prisma/prisma.service";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import {
  RequestLifecycleNotificationPayload,
  SapFailureNotificationPayload,
} from "./notification.types";

const REQUEST_EVENT_LABEL: Record<RequestLifecycleNotificationPayload["event"], string> = {
  REQUEST_CREATED: "요청 생성",
  REQUEST_APPROVED: "요청 승인",
  REQUEST_REJECTED: "요청 반려",
  REQUEST_STARTED: "작업 시작",
  REQUEST_COMPLETED: "작업 완료",
};

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
};

const notificationSelect = {
  id: true,
  category: true,
  title: true,
  message: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async notifyRequestLifecycle(payload: RequestLifecycleNotificationPayload) {
    const title = `[V-Link] ${payload.event} - ${payload.title}`;
    const message = [
      `Event: ${payload.event}`,
      `RequestId: ${payload.requestId}`,
      `Status: ${payload.status}`,
      `Team: ${payload.team}`,
      `DueDate: ${payload.dueDate.toISOString()}`,
      `Vendor: ${payload.vendorName ?? "-"}`,
      `Reason: ${payload.reason ?? "-"}`,
    ].join("\n");

    try {
      await this.createRequestInAppNotifications(payload);
    } catch (error) {
      const log = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create request in-app notifications: ${log}`);
    }

    await this.sendAllChannels({
      title,
      message,
      data: payload,
    });
  }

  async notifySapFailure(payload: SapFailureNotificationPayload) {
    const title = `[V-Link] SAP FAILED - ${payload.jobType}`;
    const message = [
      `RequestId: ${payload.requestId}`,
      `JobId: ${payload.jobId}`,
      `JobType: ${payload.jobType}`,
      `Message: ${payload.message}`,
      `ErrorCode: ${payload.errorCode ?? "-"}`,
      `HttpStatus: ${payload.httpStatus ?? "-"}`,
    ].join("\n");

    try {
      await this.createSapInAppNotifications(payload);
    } catch (error) {
      const log = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create SAP in-app notifications: ${log}`);
    }

    await this.sendAllChannels({
      title,
      message,
      data: payload,
    });
  }

  async listMyNotifications(userId: string, query: ListNotificationsQueryDto) {
    const take = Math.min(query.limit ?? 50, 200);
    return this.prisma.appNotification.findMany({
      where: {
        userId,
        ...(query.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: notificationSelect,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.appNotification.count({
      where: {
        userId,
        isRead: false,
      },
    });
    return { count };
  }

  async getUnreadRequestIds(userId: string) {
    const unreadRows = await this.prisma.appNotification.findMany({
      where: {
        userId,
        isRead: false,
      },
      select: {
        payload: true,
      },
    });

    const requestIds = new Set<string>();
    unreadRows.forEach((row) => {
      const requestId = this.extractRequestId(row.payload);
      if (requestId) {
        requestIds.add(requestId);
      }
    });

    return {
      count: unreadRows.length,
      requestIds: [...requestIds],
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const current = await this.prisma.appNotification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: notificationSelect,
    });

    if (!current) {
      throw new NotFoundException("Notification not found");
    }

    if (current.isRead) {
      return current;
    }

    return this.prisma.appNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      select: notificationSelect,
    });
  }

  async markAsUnread(userId: string, notificationId: string) {
    const current = await this.prisma.appNotification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: notificationSelect,
    });

    if (!current) {
      throw new NotFoundException("Notification not found");
    }

    if (!current.isRead) {
      return current;
    }

    return this.prisma.appNotification.update({
      where: { id: notificationId },
      data: {
        isRead: false,
        readAt: null,
      },
      select: notificationSelect,
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.appNotification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updatedCount: result.count };
  }

  private async sendAllChannels(payload: { title: string; message: string; data: unknown }) {
    const tasks: Array<Promise<void>> = [];
    tasks.push(this.sendEmail(payload.title, payload.message));
    tasks.push(this.sendAlimTalk(payload.title, payload.message, payload.data));

    const results = await Promise.allSettled(tasks);
    for (const result of results) {
      if (result.status === "rejected") {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.error(`Notification delivery failed: ${message}`);
      }
    }
  }

  private async sendEmail(subject: string, body: string) {
    const enabled = (this.configService.get<string>("NOTIFY_EMAIL_ENABLED") ?? "true").toLowerCase() === "true";
    if (!enabled) {
      return;
    }

    const toList = (this.configService.get<string>("NOTIFY_EMAIL_TO") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (toList.length === 0) {
      return;
    }

    const from = this.configService.get<string>("SMTP_FROM") ?? "vlink@localhost";
    const transporter = this.getTransporter();
    if (!transporter) {
      return;
    }

    await transporter.sendMail({
      from,
      to: toList.join(", "),
      subject,
      text: body,
    });
  }

  private async sendAlimTalk(title: string, message: string, data: unknown) {
    const enabled = (this.configService.get<string>("NOTIFY_ALIMTALK_ENABLED") ?? "true").toLowerCase() === "true";
    if (!enabled) {
      return;
    }

    const webhookUrl = this.configService.get<string>("ALIMTALK_WEBHOOK_URL");
    if (!webhookUrl) {
      return;
    }

    const apiKey = this.configService.get<string>("ALIMTALK_API_KEY");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        message,
        data,
      }),
    });
  }

  private getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>("SMTP_HOST");
    const portRaw = this.configService.get<string>("SMTP_PORT");
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");

    if (!host || !portRaw || !user || !pass) {
      return null;
    }

    const port = Number(portRaw);
    this.transporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: false,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  private async createRequestInAppNotifications(payload: RequestLifecycleNotificationPayload) {
    const request = await this.prisma.vasRequest.findUnique({
      where: { id: payload.requestId },
      include: {
        requester: {
          select: { id: true },
        },
        assignedVendor: {
          select: {
            users: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!request) {
      return;
    }

    const adminIds = await this.getAdminUserIds();
    const recipientIds = new Set<string>();

    if (payload.event === "REQUEST_CREATED") {
      adminIds.forEach((id) => recipientIds.add(id));
    }
    if (payload.event === "REQUEST_APPROVED") {
      recipientIds.add(request.requesterId);
      request.assignedVendor?.users.forEach((user) => recipientIds.add(user.id));
    }
    if (payload.event === "REQUEST_REJECTED") {
      recipientIds.add(request.requesterId);
    }
    if (payload.event === "REQUEST_STARTED" || payload.event === "REQUEST_COMPLETED") {
      adminIds.forEach((id) => recipientIds.add(id));
      recipientIds.add(request.requesterId);
    }

    if (recipientIds.size === 0) {
      return;
    }

    const eventLabel = REQUEST_EVENT_LABEL[payload.event];
    const statusLabel = REQUEST_STATUS_LABEL[payload.status] ?? payload.status;
    const dueDate = payload.dueDate.toISOString().slice(0, 10);

    const title = `[요청] ${eventLabel}`;
    const message = `${payload.title} / 상태: ${statusLabel} / 마감: ${dueDate}`;
    const payloadJson = this.toJson(payload);

    await this.prisma.appNotification.createMany({
      data: [...recipientIds].map((userId) => ({
        userId,
        category: "REQUEST",
        title,
        message,
        payload: payloadJson,
      })),
    });
  }

  private async createSapInAppNotifications(payload: SapFailureNotificationPayload) {
    const adminIds = await this.getAdminUserIds();
    if (adminIds.length === 0) {
      return;
    }

    const title = "[SAP] 연동 실패";
    const message = `요청 ${payload.requestId} / 잡 ${payload.jobType} / 코드 ${payload.errorCode ?? "-"} / ${payload.message}`;
    const payloadJson = this.toJson(payload);

    await this.prisma.appNotification.createMany({
      data: adminIds.map((userId) => ({
        userId,
        category: "SAP",
        title,
        message,
        payload: payloadJson,
      })),
    });
  }

  private async getAdminUserIds() {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true },
    });
    return admins.map((admin) => admin.id);
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private extractRequestId(payload: Prisma.JsonValue | null): string | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    if (!Object.prototype.hasOwnProperty.call(payload, "requestId")) {
      return null;
    }

    const requestId = (payload as Record<string, unknown>).requestId;
    return typeof requestId === "string" && requestId.length > 0 ? requestId : null;
  }
}
