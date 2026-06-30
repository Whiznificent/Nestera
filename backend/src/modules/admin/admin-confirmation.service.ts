import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Repository, LessThan } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AdminConfirmation } from './entities/admin-confirmation.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class AdminConfirmationService {
  private readonly logger = new Logger(AdminConfirmationService.name);
  private readonly CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(AdminConfirmation)
    private readonly confirmationRepo: Repository<AdminConfirmation>,
  ) {}

  /**
   * Request confirmation for a high-risk action.
   * Returns a confirmation token that must be provided in the retry request.
   */
  async requestConfirmation(
    adminId: string,
    actionType: string,
    actionDetails: Record<string, any>,
  ): Promise<{
    confirmationToken: string;
    expiresAt: Date;
    retryUrl: string;
  }> {
    const token = uuid();
    const expiresAt = new Date(Date.now() + this.CONFIRMATION_TTL_MS);

    const confirmation = this.confirmationRepo.create({
      token,
      adminId,
      actionType,
      actionDetails,
      expiresAt,
      isUsed: false,
    });

    await this.confirmationRepo.save(confirmation);

    this.logger.log(
      `Confirmation requested for admin ${adminId} | Action: ${actionType}`,
    );

    return {
      confirmationToken: token,
      expiresAt,
      retryUrl: `Retry the request with header: X-Confirm-Token: ${token}`,
    };
  }

  /**
   * Verify and consume a confirmation token.
   * Throws if token is invalid, expired, or already used.
   */
  async verifyConfirmation(
    token: string,
    adminId: string,
    expectedActionType: string,
  ): Promise<AdminConfirmation> {
    const confirmation = await this.confirmationRepo.findOne({
      where: { token, adminId },
    });

    if (!confirmation) {
      throw new BadRequestException('Invalid confirmation token');
    }

    if (confirmation.isUsed) {
      throw new BadRequestException('Confirmation token already used');
    }

    if (confirmation.actionType !== expectedActionType) {
      throw new BadRequestException(
        'Confirmation token does not match this action',
      );
    }

    if (new Date() > confirmation.expiresAt) {
      throw new BadRequestException('Confirmation token expired');
    }

    // Mark as used
    confirmation.isUsed = true;
    confirmation.usedAt = new Date();
    await this.confirmationRepo.save(confirmation);

    this.logger.log(`Confirmation verified for admin ${adminId}`);

    return confirmation;
  }

  /**
   * Clean up expired confirmation tokens.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.confirmationRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  /**
   * Get pending confirmations for an admin.
   */
  async getPendingConfirmations(adminId: string): Promise<AdminConfirmation[]> {
    return this.confirmationRepo.find({
      where: {
        adminId,
        isUsed: false,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
