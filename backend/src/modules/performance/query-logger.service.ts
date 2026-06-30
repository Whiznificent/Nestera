import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApmService } from '../apm/apm.service';
import {
  registerSlowQueryHandler,
  SlowQueryEvent,
} from '../../common/database/query-performance.registry';

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  params?: unknown[];
  operation?: string;
  entity?: string;
  executionPlan?: string;
}

export interface IndexSuggestion {
  table: string;
  column: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
}

export interface OptimizationRecommendation {
  category: 'indexing' | 'n-plus-one' | 'query-rewrite' | 'pool' | 'general';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affectedQueries?: string[];
}

@Injectable()
export class QueryLoggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueryLoggerService.name);
  readonly slowQueryThresholdMs = 100;
  private slowQueries: QueryMetrics[] = [];
  private readonly maxStoredQueries = 1000;
  private unregisterHandler: (() => void) | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly apmService: ApmService,
  ) {}

  onModuleInit(): void {
    this.unregisterHandler = registerSlowQueryHandler((event) =>
      this.handleSlowQuery(event),
    );
  }

  onModuleDestroy(): void {
    this.unregisterHandler?.();
    this.unregisterHandler = null;
  }

  private handleSlowQuery(event: SlowQueryEvent): void {
    if (event.duration < this.slowQueryThresholdMs) {
      return;
    }

    const metrics: QueryMetrics = {
      query: event.query,
      duration: event.duration,
      timestamp: event.timestamp,
      params: event.params,
      operation: event.operation,
      entity: event.entity,
    };

    this.recordSlowQuery(metrics);

    this.apmService.trackDbQuery(
      event.operation || 'UNKNOWN',
      event.entity || 'unknown',
      event.duration,
    );
    this.apmService.trackSlowQuery(
      event.duration,
      event.operation || 'UNKNOWN',
      event.entity || 'unknown',
    );
  }

  private recordSlowQuery(metrics: QueryMetrics): void {
    this.slowQueries.push(metrics);

    if (this.slowQueries.length > this.maxStoredQueries) {
      this.slowQueries.shift();
    }

    this.logger.warn(
      `Slow query detected (${metrics.duration}ms): ${metrics.query.substring(0, 200)}`,
      {
        duration: metrics.duration,
        operation: metrics.operation,
        entity: metrics.entity,
      },
    );
  }

  getSlowQueries(limit = 50): QueryMetrics[] {
    return this.slowQueries.slice(-limit).reverse();
  }

  getQueryStats() {
    const durations = this.slowQueries.map((q) => q.duration);

    return {
      thresholdMs: this.slowQueryThresholdMs,
      totalSlowQueries: this.slowQueries.length,
      averageDuration:
        durations.length > 0
          ? durations.reduce((sum, d) => sum + d, 0) / durations.length
          : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      p95Duration: this.percentile(durations, 0.95),
      queriesByOperation: this.groupBy(this.slowQueries, 'operation'),
      queriesByEntity: this.groupBy(this.slowQueries, 'entity'),
    };
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1];
  }

  private groupBy(
    queries: QueryMetrics[],
    field: 'operation' | 'entity',
  ): Record<string, number> {
    return queries.reduce<Record<string, number>>((acc, q) => {
      const key = q[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  async analyzeExecutionPlan(query: string): Promise<string> {
    try {
      const result = await this.dataSource.query(
        `EXPLAIN (FORMAT JSON) ${query}`,
      );
      return JSON.stringify(result, null, 2);
    } catch (error) {
      this.logger.error('Failed to analyze execution plan', error);
      return '';
    }
  }

  detectNPlusOne(): { detected: boolean; patterns: string[] } {
    const patterns: string[] = [];
    const queryMap = new Map<string, number>();

    this.slowQueries.forEach((q) => {
      const normalized = q.query
        .replace(/\$\d+/g, '?')
        .replace(/\?/g, '?')
        .toLowerCase();
      queryMap.set(normalized, (queryMap.get(normalized) || 0) + 1);
    });

    queryMap.forEach((count, query) => {
      if (count > 5) {
        patterns.push(
          `Query executed ${count} times (possible N+1): ${query.substring(0, 120)}`,
        );
      }
    });

    return {
      detected: patterns.length > 0,
      patterns,
    };
  }

  suggestIndexes(): IndexSuggestion[] {
    const suggestions = new Map<string, IndexSuggestion>();

    const sortedQueries = [...this.slowQueries].sort(
      (a, b) => b.duration - a.duration,
    );

    for (const q of sortedQueries) {
      const whereColumns = this.extractWhereColumns(q.query);
      const joinColumns = this.extractJoinColumns(q.query);
      const table = q.entity || this.extractTableName(q.query);

      for (const column of [...whereColumns, ...joinColumns]) {
        const key = `${table}:${column}`;
        if (suggestions.has(key)) continue;

        const priority: IndexSuggestion['priority'] =
          q.duration > 500 ? 'high' : q.duration > 200 ? 'medium' : 'low';

        suggestions.set(key, {
          table,
          column,
          reason: `Slow ${q.operation || 'query'} (${q.duration}ms) filters/joins on this column`,
          priority,
          estimatedImpact:
            priority === 'high'
              ? 'Likely significant latency reduction'
              : 'May improve query performance',
        });
      }
    }

    return Array.from(suggestions.values()).sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private extractWhereColumns(query: string): string[] {
    const columns: string[] = [];
    const whereClause = query.match(
      /\bWHERE\b([\s\S]*?)(?:\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i,
    )?.[1];
    if (!whereClause) return columns;

    const matches = whereClause.matchAll(
      /(?:"?(\w+)"?\.)?"?(\w+)"?\s*(?:=|>|<|>=|<=|IN|LIKE|IS)/gi,
    );
    for (const match of matches) {
      const column = match[2];
      if (
        column &&
        !['AND', 'OR', 'NOT', 'NULL'].includes(column.toUpperCase())
      ) {
        columns.push(column);
      }
    }

    return [...new Set(columns)];
  }

  private extractJoinColumns(query: string): string[] {
    const columns: string[] = [];
    const matches = query.matchAll(
      /\bON\s+(?:"?(\w+)"?\.)?"?(\w+)"?\s*=\s*(?:"?\w+"?\.)?"?(\w+)"?/gi,
    );
    for (const match of matches) {
      if (match[2]) columns.push(match[2]);
      if (match[3]) columns.push(match[3]);
    }
    return [...new Set(columns)];
  }

  private extractTableName(query: string): string {
    const fromMatch = query.match(/\bFROM\s+"?(\w+)"?/i);
    return fromMatch?.[1] || 'unknown';
  }

  getDashboard() {
    const stats = this.getQueryStats();
    const nPlusOne = this.detectNPlusOne();
    const indexSuggestions = this.suggestIndexes();

    return {
      summary: stats,
      recentSlowQueries: this.getSlowQueries(20),
      nPlusOneDetection: nPlusOne,
      indexSuggestions: indexSuggestions.slice(0, 10),
      health: {
        status:
          stats.totalSlowQueries === 0
            ? 'healthy'
            : stats.p95Duration > 1000
              ? 'degraded'
              : 'warning',
        message:
          stats.totalSlowQueries === 0
            ? 'No slow queries recorded'
            : `${stats.totalSlowQueries} slow queries recorded (p95: ${Math.round(stats.p95Duration)}ms)`,
      },
    };
  }

  generateOptimizationReport(): {
    generatedAt: Date;
    summary: ReturnType<QueryLoggerService['getQueryStats']>;
    recommendations: OptimizationRecommendation[];
    indexSuggestions: IndexSuggestion[];
    nPlusOne: ReturnType<QueryLoggerService['detectNPlusOne']>;
  } {
    const stats = this.getQueryStats();
    const nPlusOne = this.detectNPlusOne();
    const indexSuggestions = this.suggestIndexes();
    const recommendations: OptimizationRecommendation[] = [];

    if (stats.totalSlowQueries > 10) {
      recommendations.push({
        category: 'general',
        severity: stats.p95Duration > 1000 ? 'critical' : 'warning',
        title: 'Elevated slow query volume',
        description: `${stats.totalSlowQueries} queries exceeded the ${this.slowQueryThresholdMs}ms threshold. Review the slowest queries and consider caching or query restructuring.`,
      });
    }

    if (nPlusOne.detected) {
      recommendations.push({
        category: 'n-plus-one',
        severity: 'critical',
        title: 'N+1 query patterns detected',
        description:
          'Repeated identical queries suggest missing eager loading or batch fetching. Use JOINs or DataLoader patterns.',
        affectedQueries: nPlusOne.patterns,
      });
    }

    for (const suggestion of indexSuggestions.filter(
      (s) => s.priority === 'high',
    )) {
      recommendations.push({
        category: 'indexing',
        severity: 'warning',
        title: `Add index on ${suggestion.table}.${suggestion.column}`,
        description: suggestion.reason,
      });
    }

    const sequentialScanQueries = this.slowQueries.filter(
      (q) => q.query.includes('Seq Scan') || q.duration > 500,
    );
    if (sequentialScanQueries.length > 0) {
      recommendations.push({
        category: 'query-rewrite',
        severity: 'warning',
        title: 'Review high-latency queries for full table scans',
        description:
          'Queries exceeding 500ms may benefit from index additions, query rewrites, or pagination limits.',
        affectedQueries: sequentialScanQueries
          .slice(0, 5)
          .map((q) => q.query.substring(0, 100)),
      });
    }

    if (stats.p95Duration > 200) {
      recommendations.push({
        category: 'pool',
        severity: 'info',
        title: 'Monitor connection pool under load',
        description:
          'High query latency may correlate with pool exhaustion. Check /performance/pool-metrics and db_pool_active_connections gauge.',
      });
    }

    return {
      generatedAt: new Date(),
      summary: stats,
      recommendations,
      indexSuggestions,
      nPlusOne,
    };
  }

  clearMetrics(): void {
    this.slowQueries = [];
  }
}
