import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  ActivityTimeline,
  ActivityTimelineCategory,
} from '../entities/activity-timeline.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShutdownTrackedTask } from '../../../common/decorators/shutdown-task.decorator';

@Injectable()
export class ActivityTimelineService {
  private readonly logger = new Logger(ActivityTimelineService.name);

  constructor(
    @InjectRepository(ActivityTimeline)
    private readonly timelineRepo: Repository<ActivityTimeline>,
  ) {}

  async record(
    userId: string,
    category: ActivityTimelineCategory,
    action: string,
    description?: string,
    referenceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<ActivityTimeline> {
    const entry = this.timelineRepo.create({
      userId,
      category,
      action,
      description,
      referenceId,
      metadata,
    });
    return this.timelineRepo.save(entry);
  }

  async findByUser(
    userId: string,
    options?: {
      category?: ActivityTimelineCategory;
      limit?: number;
      offset?: number;
    },
  ): Promise<ActivityTimeline[]> {
    const where: Record<string, unknown> = { userId };
    if (options?.category) {
      where.category = options.category;
    }
    return this.timelineRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  async findOne(id: string, userId: string): Promise<ActivityTimeline> {
    const entry = await this.timelineRepo.findOne({ where: { id, userId } });
    if (!entry) {
      throw new NotFoundException('Activity timeline entry not found');
    }
    return entry;
  }

  async getRecentActivity(
    userId: string,
    minutes: number = 60,
  ): Promise<ActivityTimeline[]> {
    const since = new Date(Date.now() - minutes * 60_000);
    return this.timelineRepo.find({
      where: { userId, createdAt: LessThan(since) },
      order: { createdAt: 'DESC' },
    });
  }

  @ShutdownTrackedTask()
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldEntries(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const result = await this.timelineRepo.delete({
      createdAt: LessThan(cutoff),
    });
    this.logger.log(
      `Cleaned up ${result.affected} old activity timeline entries`,
    );
  }
}
