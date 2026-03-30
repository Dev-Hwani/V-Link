import { Module } from "@nestjs/common";

import { SapModule } from "../sap/sap.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

@Module({
  imports: [SapModule],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
