import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

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
