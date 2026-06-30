import { BadRequestException } from '@nestjs/common';

/**
 * The full sort key encoded in every pagination cursor.
 *
 * Both fields MUST be included to guarantee stable, deterministic ordering.
 * Using only `createdAt` would cause duplicates or missed records when two
 * rows share the same timestamp (e.g. concurrent inserts, batch seeding).
 *
 * The compound predicate used in queries is:
 *   (createdAt < :cursorCreatedAt)
 *   OR (createdAt = :cursorCreatedAt AND id < :cursorId)          -- for DESC
 *   (createdAt > :cursorCreatedAt)
 *   OR (createdAt = :cursorCreatedAt AND id > :cursorId)          -- for ASC
 *
 * This predicate is index-friendly when a composite index on (createdAt, id)
 * exists on the underlying table.
 */
export interface CursorPayload {
  /** ISO-8601 UTC timestamp of the last item on the current page. */
  createdAt: string;
  /** UUID (or string PK) of the last item on the current page. */
  id: string;
}

/**
 * Encodes a {@link CursorPayload} into a URL-safe base64 string.
 *
 * The cursor is intentionally opaque to API consumers — its internal structure
 * is an implementation detail and may change without notice. Clients MUST NOT
 * parse or construct cursor values; they should only pass back the value
 * returned in `meta.nextCursor`.
 *
 * @example
 * const cursor = encodeCursor({ createdAt: item.createdAt.toISOString(), id: item.id });
 * // → "eyJjcmVhdGVkQXQiOiIyMDI0LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJpZCI6ImFiYy0xMjMifQ"
 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor string back into a {@link CursorPayload}.
 *
 * Throws {@link BadRequestException} (HTTP 400) if the cursor is malformed,
 * missing required fields, or contains an invalid timestamp. This prevents
 * silent data corruption from hand-crafted or expired cursors.
 *
 * @throws {BadRequestException} when the cursor cannot be parsed or validated.
 *
 * @example
 * const { createdAt, id } = decodeCursor(queryDto.cursor);
 * qb.andWhere(
 *   '(item.createdAt < :cursorCreatedAt OR (item.createdAt = :cursorCreatedAt AND item.id < :cursorId))',
 *   { cursorCreatedAt: new Date(createdAt), cursorId: id },
 * );
 */
export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const payload = JSON.parse(raw) as CursorPayload;
    if (!payload?.createdAt || !payload?.id) {
      throw new Error('Invalid cursor payload');
    }
    if (Number.isNaN(new Date(payload.createdAt).getTime())) {
      throw new Error('Invalid cursor timestamp');
    }
    return payload;
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}
