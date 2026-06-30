import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../job-queue.constants';
import { EmailJobData } from '../job-queue.service';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<EmailJobData>): Promise<any> {
    this.logger.debug(
      `Processing email job ${job.id} (attempt ${job.attemptsMade + 1})`,
    );

    const { to, subject, template } = job.data;

    this.logger.log(
      `Email dispatched: to=${to} subject="${subject}" template=${template}`,
    );

    return { processed: true, to, subject };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EmailJobData>, error: Error) {
    this.logger.error(
      `Email job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
    );

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      this.logger.error(
        `Email job ${job.id} moved to DLQ — to=${job.data.to} subject="${job.data.subject}"`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EmailJobData>) {
    this.logger.debug(`Email job ${job.id} completed`);
  }
}
