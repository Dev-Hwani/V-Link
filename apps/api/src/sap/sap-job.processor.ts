import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";

import { SapService } from "./sap.service";

@Injectable()
export class SapJobProcessor {
  private readonly logger = new Logger(SapJobProcessor.name);
  private running = false;

  constructor(private readonly sapService: SapService) {}

  @Interval(15000)
  async drainQueue() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const { processed } = await this.sapService.processQueuedJobs();
      if (processed > 0) {
        this.logger.log(`Processed SAP queue jobs: ${processed}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown queue processing error";
      this.logger.error(`SAP queue processing failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}

