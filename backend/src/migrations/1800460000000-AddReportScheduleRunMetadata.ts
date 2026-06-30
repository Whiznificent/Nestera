import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReportScheduleRunMetadata1800460000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('report_schedules', [
      new TableColumn({
        name: 'lastJobId',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'lastRunAt',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'lastError',
        type: 'text',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('report_schedules', 'lastError');
    await queryRunner.dropColumn('report_schedules', 'lastRunAt');
    await queryRunner.dropColumn('report_schedules', 'lastJobId');
  }
}
