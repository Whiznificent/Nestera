import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AvatarUploadService } from './avatar-upload.service';
import { SweepTasksService } from './sweep-tasks.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { StorageModule } from '../storage/storage.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { User } from './entities/user.entity';
import { UserWallet } from './entities/user-wallet.entity';
import { AvatarUpload } from './entities/avatar-upload.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserWallet, AvatarUpload]),
    StorageModule,
    BlockchainModule,
  ],
  controllers: [UserController, WalletController],
  providers: [
    UserService,
    AvatarUploadService,
    SweepTasksService,
    WalletService,
  ],
  exports: [UserService, AvatarUploadService, SweepTasksService, WalletService],
})
export class UserModule {}
