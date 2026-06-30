import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportProcessor } from './report.processor';
import { ScheduledReportService } from '../../reports/scheduled-report.service';
import { ReportSchedule } from '../../reports/entities/report-schedule.entity';
import {
  ReportType,
  ReportFormat,
  ReportScheduleFrequency,
} from '../../reports/entities/report-schedule.entity';

describe('ReportProcessor', () => {
  let processor: ReportProcessor;
  const scheduledReportService = {
    generateAndArchive: jest.fn(),
  };
  const scheduleRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportProcessor,
        {
          provide: ScheduledReportService,
          useValue: scheduledReportService,
        },
        {
          provide: getRepositoryToken(ReportSchedule),
          useValue: scheduleRepository,
        },
      ],
    }).compile();

    processor = module.get<ReportProcessor>(ReportProcessor);
  });

  it('generates scheduled report when scheduleId is present', async () => {
    const schedule = {
      id: 'sched-1',
      userId: 'user-1',
      reportType: ReportType.DAILY_SUMMARY,
      format: ReportFormat.PDF,
      frequency: ReportScheduleFrequency.DAILY,
    };
    scheduleRepository.findOne.mockResolvedValue(schedule);
    scheduledReportService.generateAndArchive.mockResolvedValue({
      id: 'archive-1',
    });

    const result = await processor.process({
      id: 'job-1',
      data: {
        scheduleId: 'sched-1',
        reportType: ReportType.DAILY_SUMMARY,
        userId: 'user-1',
        params: {},
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as any);

    expect(scheduledReportService.generateAndArchive).toHaveBeenCalledWith(
      schedule,
    );
    expect(scheduleRepository.update).toHaveBeenCalledWith(
      'sched-1',
      expect.objectContaining({ lastError: null }),
    );
    expect(result.archiveId).toBe('archive-1');
  });
});
