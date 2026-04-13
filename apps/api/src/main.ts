import { NestFactory } from "@nestjs/core";

import { configureApp } from "./app-bootstrap";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(Number.isFinite(port) ? port : 4000);
}

bootstrap();
