import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";

import { SAP_CLIENT } from "./sap.constants";
import { ODataSapClient } from "./odata-sap.client";
import { SapService } from "./sap.service";

@Module({
  imports: [HttpModule],
  providers: [
    ODataSapClient,
    {
      provide: SAP_CLIENT,
      useExisting: ODataSapClient,
    },
    SapService,
  ],
  exports: [SapService],
})
export class SapModule {}
