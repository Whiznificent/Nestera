import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddReferralFraudDetection1800500000002 implements MigrationInterface {
  name = 'AddReferralFraudDetection1800500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "referrals_status_enum" ADD VALUE IF NOT EXISTS 'quarantined'`,
    );

    const referralsTable = await queryRunner.getTable('referrals');
    if (referralsTable && !referralsTable.findColumnByName('fraud_reasons')) {
      await queryRunner.addColumns('referrals', [
        new TableColumn({
          name: 'fraud_reasons',
          type: 'jsonb',
          isNullable: true,
        }),
        new TableColumn({
          name: 'requires_manual_review',
          type: 'boolean',
          default: false,
        }),
        new TableColumn({
          name: 'quarantined_at',
          type: 'timestamp',
          isNullable: true,
        }),
      ]);
    }

    await queryRunner.createTable(
      new Table({
        name: 'referral_fraud_audits',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'referral_id',
            type: 'uuid',
          },
          {
            name: 'referrer_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'referee_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'reasons',
            type: 'jsonb',
          },
          {
            name: 'decision_metadata',
            type: 'jsonb',
          },
          {
            name: 'rationale',
            type: 'text',
          },
          {
            name: 'action',
            type: 'varchar',
            length: '32',
          },
          {
            name: 'actor',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'referral_fraud_audits',
      new TableIndex({
        name: 'idx_referral_fraud_audits_referral_id',
        columnNames: ['referral_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('referral_fraud_audits');
    await queryRunner.dropColumn('referrals', 'quarantined_at');
    await queryRunner.dropColumn('referrals', 'requires_manual_review');
    await queryRunner.dropColumn('referrals', 'fraud_reasons');
  }
}
