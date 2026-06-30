import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAvatarUploadsTable1800450000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE avatar_processing_status AS ENUM (
          'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'avatar_uploads',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid', isNullable: false },
          { name: 'originalFilename', type: 'varchar', isNullable: false },
          { name: 'storagePath', type: 'varchar', isNullable: false },
          { name: 'mimeType', type: 'varchar', isNullable: false },
          { name: 'fileSize', type: 'int', isNullable: false },
          {
            name: 'processingStatus',
            type: 'avatar_processing_status',
            default: "'PENDING'",
            isNullable: false,
          },
          { name: 'jobId', type: 'varchar', isNullable: true },
          { name: 'processedUrl', type: 'varchar', isNullable: true },
          { name: 'processingError', type: 'text', isNullable: true },
          { name: 'processingMetadata', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'avatar_uploads',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'avatar_uploads',
      new TableIndex({
        name: 'IDX_AVATAR_UPLOADS_USER_ID',
        columnNames: ['userId', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('avatar_uploads');
    await queryRunner.query(`DROP TYPE IF EXISTS avatar_processing_status;`);
  }
}
