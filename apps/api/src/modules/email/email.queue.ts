import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type {
  EmailRecipient,
  EmailTemplateData,
} from "@supkeys/email";
import type { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  EMAIL_JOB_NAME,
  EMAIL_QUEUE_NAME,
  type EmailJobContext,
  type EmailJobPayload,
} from "./dto/email-job.dto";

interface EnqueueInput {
  to: EmailRecipient;
  templateData: EmailTemplateData;
  context?: EmailJobContext;
  /** Render edilmiş subject — log'a yazılması için (fallback: template adı) */
  subject?: string;
}

@Injectable()
export class EmailQueue {
  private readonly logger = new Logger(EmailQueue.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE_NAME) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(input: EnqueueInput): Promise<string> {
    const log = await this.prisma.emailLog.create({
      data: {
        template: input.templateData.template,
        toEmail: input.to.email,
        toName: input.to.name,
        subject: input.subject ?? input.templateData.template,
        provider: "pending",
        status: "QUEUED",
        payload: input.templateData.data as object,
        contextType: input.context?.type,
        contextId: input.context?.id,
      },
      select: { id: true },
    });

    const payload: EmailJobPayload = {
      to: input.to,
      templateData: input.templateData,
      context: input.context,
      emailLogId: log.id,
    };

    await this.queue.add(EMAIL_JOB_NAME, payload, {
      jobId: log.id,
    });

    this.logger.log(
      `Queued email ${log.id} (${input.templateData.template}) → ${input.to.email}`,
    );
    return log.id;
  }
}
