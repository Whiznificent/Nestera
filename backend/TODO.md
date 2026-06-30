# Backend TODO - Stellar resilience & safe replay

## Step 1: Circuit breaker wiring
- [ ] Update `backend/src/modules/blockchain/rpc-client.wrapper.ts` to integrate `CircuitBreakerService`.
- [ ] Skip OPEN breakers and continue to next endpoint.

## Step 2: Replay dedup hardening
- [x] Update `backend/src/modules/blockchain/stellar-event-listener.service.ts` to use unique-constraint-safe insert semantics.
- [ ] Keep ordering guarantees (sequential processing + cursor advanced after batch).

## Step 3: Tests
- [ ] Extend `backend/src/modules/blockchain/rpc-client.wrapper.spec.ts` to simulate endpoint failures and circuit breaker OPEN.
- [ ] Extend `backend/src/modules/blockchain/stellar-event-listener.service.spec.ts` to simulate RPC failures across polls and duplicate insert handling.

## Step 4: Run tests
- [ ] Run Jest suite (backend) to confirm acceptance criteria.

