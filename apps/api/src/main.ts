import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";
import { Request, Response } from "express";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOriginsRaw = process.env.WEB_APP_ORIGIN ?? "http://localhost:3000";
  const corsOrigins = corsOriginsRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.use(cookieParser());
  app.use((request: Request, response: Response, next: () => void) => {
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next();
      return;
    }

    const path = request.path;
    if (path === "/auth/login" || path === "/auth/signup" || path === "/health") {
      next();
      return;
    }

    const hasAuthCookie = Boolean(request.cookies?.access_token || request.cookies?.refresh_token);
    if (!hasAuthCookie) {
      next();
      return;
    }

    const csrfCookie = request.cookies?.csrf_token;
    const csrfHeader = request.headers["x-csrf-token"];
    const csrfHeaderValue = typeof csrfHeader === "string" ? csrfHeader : Array.isArray(csrfHeader) ? csrfHeader[0] : "";
    if (!csrfCookie || !csrfHeaderValue || csrfCookie !== csrfHeaderValue) {
      response.status(403).json({
        message: "Invalid CSRF token",
        statusCode: 403,
      });
      return;
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(Number.isFinite(port) ? port : 4000);
}

bootstrap();
