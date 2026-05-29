import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../entities/session.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    const secret = configService.get<string>('jwt.secret');
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role?: string;
    kycStatus?: string;
    jti?: string;
  }) {
    // If JTI is present, validate session is not revoked
    if (payload.jti) {
      const session = await this.sessionRepository.findOne({
        where: { jti: payload.jti, isRevoked: false },
      });

      if (!session) {
        throw new UnauthorizedException('Session has been revoked');
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session has expired');
      }

      // Update last accessed time
      await this.sessionRepository.update(session.id, {
        lastAccessedAt: new Date(),
      });
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role ?? 'USER',
      kycStatus: payload.kycStatus ?? 'NOT_SUBMITTED',
      jti: payload.jti,
    };
  }
}
