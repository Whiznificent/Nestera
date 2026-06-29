export enum ReferralFraudReason {
  SELF_REFERRAL = 'self_referral',
  SIMILAR_METADATA = 'similar_metadata',
  SUSPICIOUS_SIGNUP_PATTERN = 'suspicious_signup_pattern',
  EXCESSIVE_CREATION = 'excessive_creation',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  RAPID_COMPLETION = 'rapid_completion',
  SUSPICIOUS_WITHDRAWAL = 'suspicious_withdrawal',
}

export interface ReferralFraudEvaluationContext {
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  signupSource?: string;
}

export interface ReferralFraudEvaluationResult {
  isSuspicious: boolean;
  reasons: ReferralFraudReason[];
  metadata: Record<string, unknown>;
  shouldQuarantine: boolean;
}
