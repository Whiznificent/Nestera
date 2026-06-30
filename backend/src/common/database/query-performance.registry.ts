export interface SlowQueryEvent {
  query: string;
  duration: number;
  timestamp: Date;
  params?: unknown[];
  operation?: string;
  entity?: string;
}

export type SlowQueryHandler = (event: SlowQueryEvent) => void;

const handlers = new Set<SlowQueryHandler>();

export function registerSlowQueryHandler(
  handler: SlowQueryHandler,
): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function notifySlowQuery(event: SlowQueryEvent): void {
  for (const handler of handlers) {
    handler(event);
  }
}

export function clearSlowQueryHandlers(): void {
  handlers.clear();
}
