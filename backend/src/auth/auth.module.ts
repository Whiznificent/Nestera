import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserModule } from '../modules/user/user.module';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { AuthController } from './auth.controller';
import { User } from '../modules/user/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Session } from './entities/session.entity';
import { CacheModule } from '../modules/cache/cache.module';
import { CacheStrategyService } from '../modules/cache/cache-strategy.service';
import { AuthRateLimitService } from './services/auth-rate-limit.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { AuthSecurityAdminController } from './controllers/auth-security-admin.controller';
import { AuditLog } from '../common/entities/audit-log.entity';
import { AuditLogService } from '../common/services/audit-log.service';

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([User, RefreshToken, Session, AuditLog]),
    CacheModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiration = configService.get<string>('jwt.expiration') ?? '1h';
        return {
          secret: configService.get<string>('jwt.secret'),
          signOptions: {
            expiresIn: expiration as any,
          },
        };
      },
    }),
  ],
  controllers: [AuthController, AuthSecurityAdminController],
  providers: [
    AuthService,
    TwoFactorService,
    JwtStrategy,
    CacheStrategyService,
    AuthRateLimitService,
    AuthRateLimitGuard,
    AuditLogService,
  ],
  exports: [
    AuthService,
    TwoFactorService,
    JwtModule,
    PassportModule,
    AuthRateLimitService,
    AuditLogService,
  ],
})
export class AuthModule {}
