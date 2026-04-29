import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  EMAIL_QUEUE_NAME,
  type EmailJobPayload,
} from "./dto/email-job.dto";
import { EmailService } from "./email.service";

@Processor(EMAIL_QUEUE_NAME)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    this.logger.debug(
      `Processing email job ${job.id} (attempt ${job.attemptsMade + 1})`,
    );
    await this.emailService.processJob(job.data);
  }
}
