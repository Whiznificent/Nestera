import { QueryPerformanceLogger } from './query-performance.logger';
import {
  clearSlowQueryHandlers,
  notifySlowQuery,
  registerSlowQueryHandler,
} from './query-performance.registry';

describe('QueryPerformanceLogger', () => {
  let logger: QueryPerformanceLogger;

  beforeEach(() => {
    clearSlowQueryHandlers();
    logger = new QueryPerformanceLogger();
  });

  afterEach(() => {
    clearSlowQueryHandlers();
  });

  it('notifies handlers for slow queries via logQuerySlow', () => {
    const handler = jest.fn();
    registerSlowQueryHandler(handler);

    logger.logQuerySlow(150, 'SELECT * FROM users WHERE id = $1', [1]);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 150,
        query: 'SELECT * FROM users WHERE id = $1',
        operation: 'SELECT',
        entity: 'users',
        params: [1],
      }),
    );
  });

  it('parses entity from INSERT queries', () => {
    const handler = jest.fn();
    registerSlowQueryHandler(handler);

    logger.logQuerySlow(200, 'INSERT INTO transactions (amount) VALUES ($1)');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'INSERT',
        entity: 'transactions',
      }),
    );
  });

  it('notifies handlers for query errors', () => {
    const handler = jest.fn();
    registerSlowQueryHandler(handler);

    logger.logQueryError('syntax error', 'SELECT FROM broken', []);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('syntax error'),
      }),
    );
  });
});

describe('query-performance.registry', () => {
  beforeEach(() => clearSlowQueryHandlers());
  afterEach(() => clearSlowQueryHandlers());

  it('unregisters handlers when cleanup is called', () => {
    const handler = jest.fn();
    const unregister = registerSlowQueryHandler(handler);
    unregister();

    notifySlowQuery({
      query: 'SELECT 1',
      duration: 120,
      timestamp: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
