import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAdminConfirmationsTable1800600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'admin_confirmations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'adminId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'token',
            type: 'varchar',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'actionType',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'actionDetails',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'isUsed',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'usedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'admin_confirmations',
      new TableIndex({
        name: 'IDX_admin_confirmations_token',
        columnNames: ['token'],
      }),
    );

    await queryRunner.createIndex(
      'admin_confirmations',
      new TableIndex({
        name: 'IDX_admin_confirmations_adminId_isUsed',
        columnNames: ['adminId', 'isUsed'],
      }),
    );

    await queryRunner.createIndex(
      'admin_confirmations',
      new TableIndex({
        name: 'IDX_admin_confirmations_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('admin_confirmations');
  }
}
