# Admin Throttling Implementation

## Overview

This implementation adds rate limiting and confirmation workflows for high-risk admin endpoints in the Nestera backend. Admins executing high-risk operations now face stricter rate limits and must provide confirmation tokens to execute sensitive actions.

## Features

### 1. Admin-High-Risk Rate Limiting

**Configuration:** 2 requests per 5 minutes per admin

Added a new throttle configuration `admin-high-risk` to the `ThrottlerModule` with strict limits:

```typescript
{
  name: 'admin-high-risk',
  ttl: 5 * 60 * 1000, // 5 minutes
  limit: 2, // 2 requests per 5 minutes
}
```

### 2. High-Risk Endpoint Marking

Created `@AdminHighRisk()` decorator to mark sensitive endpoints:

```typescript
@Patch('users/:id/kyc/approve')
@AdminHighRisk()
async approveKyc(@Param('id') userId: string) {
  // ...
}
```

### 3. Two-Step Confirmation Workflow

**First Request (without token):**
- Admin calls the endpoint without `X-Confirm-Token` header
- Receives 403 Forbidden response with confirmation token
- Response includes: token, expiration time, next steps

**Second Request (with token):**
- Admin calls endpoint again with `X-Confirm-Token` header
- Token is verified (valid, not used, not expired)
- Action is executed

### 4. Confirmation Token Management

**AdminConfirmationService** handles:
- Token generation (UUID-based, 5-minute TTL)
- Token verification and consumption
- Expired token cleanup
- Pending confirmation tracking

**Database Table:** `admin_confirmations`
- Stores token, admin ID, action type, and action details
- Tracks usage and expiration
- Indexes on token, adminId, and expiresAt for performance

## Protected Endpoints

### KYC Management
- `PATCH /admin/users/:id/kyc/approve` - Approve user KYC
- `PATCH /admin/users/:id/kyc/reject` - Reject user KYC
- `PATCH /admin/users/:id/kyc` - Update KYC status

### User Management
- `PATCH /admin/users/:id/role` - Change user role
- `PATCH /admin/users/:id/status` - Activate/deactivate account
- `POST /admin/users/bulk-action` - Bulk operations

### Withdrawal Management
- `POST /admin/withdrawals/:id/approve` - Approve withdrawal
- `POST /admin/withdrawals/:id/reject` - Reject withdrawal

## Architecture

### Components

1. **Decorator:** `@AdminHighRisk()`
   - Marks endpoint as high-risk
   - Applies rate limiting via `@Throttle()`
   - Sets metadata for guard/interceptor recognition

2. **Guard:** `AdminConfirmationGuard`
   - Checks if endpoint is high-risk
   - Throws 403 if confirmation token is missing
   - Allows request to proceed if token is present

3. **Filter:** `AdminConfirmationFilter`
   - Catches 403 ForbiddenException
   - Generates and returns confirmation token on first attempt
   - Handles token delivery

4. **Interceptor:** `AdminConfirmationInterceptor`
   - Verifies confirmation token before handler execution
   - Consumes token (marks as used)
   - Throws error if token is invalid/expired

5. **Service:** `AdminConfirmationService`
   - Manages token lifecycle
   - Validates tokens
   - Cleans up expired tokens

6. **Guard Extension:** `TieredThrottlerGuard`
   - Updated with admin-high-risk tier limits
   - Enforces per-user rate limiting

## Example Workflow

### Request 1: Get Confirmation Token

```bash
curl -X PATCH http://localhost:3001/admin/users/123/kyc/approve \
  -H "Authorization: Bearer <token>"
```

**Response 403:**

```json
{
  "confirmationRequired": true,
  "message": "This is a high-risk operation and requires confirmation...",
  "actionType": "PATCH:/admin/users/123/kyc/approve",
  "confirmationToken": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-06-29T11:54:00Z",
  "nextStep": "Retry the request with header: X-Confirm-Token: 550e8400..."
}
```

### Request 2: Execute with Confirmation

```bash
curl -X PATCH http://localhost:3001/admin/users/123/kyc/approve \
  -H "Authorization: Bearer <token>" \
  -H "X-Confirm-Token: 550e8400-e29b-41d4-a716-446655440000"
```

**Response 200:**

```json
{
  "id": "123",
  "kycStatus": "APPROVED",
  "updatedAt": "2026-06-29T11:49:00Z"
}
```

## Rate Limiting Behavior

### Tier-Based Limits

- **Free/Verified/Premium Users:** 0 requests (blocked entirely)
- **Admin Users:** 2 requests per 5 minutes

Exceeding limits returns 429 Too Many Requests with headers:

```
X-RateLimit-Limit: 2
X-RateLimit-Remaining: 0
Retry-After: 300
X-RateLimit-Reset: 2026-06-29T11:54:00Z
```

## Database Migration

Migration file: `1800600000000-CreateAdminConfirmationsTable.ts`

Creates `admin_confirmations` table with:
- UUID primary key
- Admin ID reference
- Unique token
- Action type and details (JSON)
- Usage tracking (isUsed, usedAt)
- Expiration tracking
- Three indexes for performance

## Testing

### Unit Tests

Location: `src/modules/admin/admin-confirmation.service.spec.ts`

Tests cover:
- Token generation and return
- Token validation and consumption
- Error handling (invalid, used, expired)
- Cleanup functionality
- Pending confirmation retrieval

### Integration Testing

To test the workflow:

1. Call high-risk endpoint without confirmation:
   - Expect 403 with confirmation token
   - Extract token from response

2. Call same endpoint with token:
   - Provide token via `X-Confirm-Token` header
   - Expect 200 with successful action result

3. Test rate limiting:
   - Call 3 times within 5 minutes
   - First 2 should require confirmation
   - Third should get 429 Too Many Requests

## Configuration

All throttle limits are defined in `app.module.ts` in the `ThrottlerModule.forRoot()` configuration. Admin-high-risk is tier-based in `TieredThrottlerGuard.ts`.

To adjust limits, modify:
- `ThrottlerModule` for default limits
- `TieredThrottlerGuard` for tier-specific limits

## Future Enhancements

1. **Email/SMS Notification:** Notify admin when confirmation is requested
2. **Approval Chain:** Require approval from another admin
3. **Reason Tracking:** Store audit reason for sensitive actions
4. **Risk Scoring:** Dynamically adjust throttle based on risk assessment
5. **Geographic Checks:** Restrict high-risk actions from unusual locations
