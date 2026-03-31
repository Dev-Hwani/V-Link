import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";

import {
  RequestLifecycleNotificationPayload,
  SapFailureNotificationPayload,
} from "./notification.types";

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

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

    await this.sendAllChannels({
      title,
      message,
      data: payload,
    });
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
}

