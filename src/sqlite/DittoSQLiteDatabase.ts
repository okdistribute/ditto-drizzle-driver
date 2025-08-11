import { Ditto, StoreObserver } from '@dittolive/ditto';
import { DefaultLogger } from 'drizzle-orm/logger';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from 'drizzle-orm/relations';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { DrizzleConfig } from 'drizzle-orm/utils';
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import { DittoSQLiteSession } from './DittoSQLiteSession';
import { DittoSQLiteTransactionConfig } from './DittoSQLiteBaseSession';
import type { QueryResult } from '@dittolive/ditto';
import { sqlToDql, mapDqlResultToSql } from '../utils/sqlToDql';
import { validateDittoSchema } from '../utils/schemaValidator';

export type DrizzleQuery<T> = {
  toSQL(): { sql: string; params: any[] };
  execute(): Promise<T | T[]>;
};

export interface ObserveOptions {
  /**
   * Whether to emit the initial state immediately
   * @default true
   */
  emitInitialValue?: boolean;
  
  /**
   * Whether to batch multiple rapid changes
   * @default false
   */
  debounce?: number;
}

export interface QueryObserver {
  /**
   * Stop observing the query
   */
  cancel(): void;
  
  /**
   * Whether the observer is active
   */
  isActive: boolean;
}

export type ObserveCallback<T> = (data: T[], metadata?: { 
  hasChanges: boolean;
  timestamp: number;
}) => void;

export class DittoSQLiteDatabase<TSchema extends Record<string, unknown> = Record<string, never>> 
  extends BaseSQLiteDatabase<'async', QueryResult, TSchema> {
  
  private dittoStore: any;

  constructor(ditto: Ditto, config?: DrizzleConfig<TSchema>) {
    const dialect = new SQLiteAsyncDialect({ casing: config?.casing });

    
    let logger;
    if (config?.logger === true) {
      logger = new DefaultLogger();
    } else if (config?.logger !== false) {
      logger = config?.logger;
    }

    let schema;
    if (config?.schema) {
      // Validate schema for unsupported Ditto features
      validateDittoSchema(config.schema);
      
      const tablesConfig = extractTablesRelationalConfig(
        config.schema, 
        createTableRelationsHelpers
      );
      schema = {
        fullSchema: config.schema,
        schema: tablesConfig.tables,
        tableNamesMap: tablesConfig.tableNamesMap
      };
    }

    const session = new DittoSQLiteSession(
      ditto.store, 
      dialect, 
      schema, 
      { logger }
    );
    
    super('async', dialect, session, schema as any);
    this.dittoStore = ditto.store;
  }

  override async transaction<T>(
    transaction: (tx: SQLiteTransaction<'async', QueryResult, TSchema, ExtractTablesWithRelations<TSchema>>) => Promise<T>,
    config?: DittoSQLiteTransactionConfig
  ): Promise<T> {
    return super.transaction(transaction, config);
  }

  // Add execute method for direct DQL queries (for debugging/testing)
  async execute(query: string, args?: Record<string, any>): Promise<QueryResult> {
    return this.dittoStore.execute(query, args);
  }

  /**
   * Create an index on a table column
   * @param tableName - The table to create the index on
   * @param columnName - The column to index
   * @param indexName - Optional name for the index (defaults to tableName_columnName_idx)
   * @returns Promise that resolves when index is created
   */
  async createIndex(tableName: string, columnName: string, indexName?: string): Promise<void> {
    // Map 'id' to '_id' for Ditto compatibility
    const mappedColumn = columnName === 'id' ? '_id' : columnName;
    const name = indexName || `${tableName}_${columnName}_idx`;
    const sql = `CREATE INDEX IF NOT EXISTS ${name} ON ${tableName} (${mappedColumn})`;
    const dqlQuery = sqlToDql(sql, []);
    await this.dittoStore.execute(dqlQuery.query, dqlQuery.args);
  }

  /**
   * Observe a Drizzle query for real-time updates
   * Similar to PowerSync's watch API but using Ditto's StoreObserver
   * 
   * NOTE: This feature uses Ditto's StoreObserver API which may be experimental
   * in some Ditto versions. Please ensure your Ditto SDK version supports
   * store observers before using this method.
   * 
   * @param query - A Drizzle query to observe
   * @param callback - Function called when data changes
   * @param options - Configuration options
   * @returns QueryObserver object to control the observation
   * 
   * @example
   * const observer = db.observe(
   *   db.select().from(users).where(eq(users.active, true)),
   *   (users) => {
   *     console.log('Active users updated:', users);
   *   }
   * );
   * 
   * // Later, stop observing
   * observer.cancel();
   */
  observe<T>(
    query: DrizzleQuery<T>,
    callback: ObserveCallback<T>,
    options?: ObserveOptions
  ): QueryObserver {
    const { sql, params } = query.toSQL();
    const dqlQuery = sqlToDql(sql, params);
    
    // Default options
    const opts = {
      emitInitialValue: true,
      debounce: 0,
      ...options
    };
    
    let isActive = true;
    let observer: StoreObserver | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let isFirstCallback = true;
    
    // Create the store observer
    const setupObserver = () => {
      observer = this.dittoStore.registerObserver(
        dqlQuery.query,
        (result: QueryResult) => {
          if (!isActive) return;
          
          // Skip the first callback if emitInitialValue is false
          if (isFirstCallback && !opts.emitInitialValue) {
            isFirstCallback = false;
            return;
          }
          isFirstCallback = false;
          
          // Map results using same logic as prepared queries
          const mappedResults = result.items.map(item => 
            mapDqlResultToSql(item.value)
          ) as T[];
          
          const triggerCallback = () => {
            callback(mappedResults, {
              hasChanges: true,
              timestamp: Date.now()
            });
          };
          
          // Handle debouncing if configured
          if (opts.debounce > 0) {
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(triggerCallback, opts.debounce);
          } else {
            triggerCallback();
          }
        },
        dqlQuery.args // Pass query arguments as third parameter
      );
    };
    
    setupObserver();
    
    // Return observer control object
    return {
      cancel: () => {
        isActive = false;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        if (observer) {
          observer.cancel();
          observer = null;
        }
      },
      get isActive() {
        return isActive;
      }
    };
  }
}

export function wrapDittoWithDrizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
  ditto: Ditto,
  config?: DrizzleConfig<TSchema>
): DittoSQLiteDatabase<TSchema> {
  return new DittoSQLiteDatabase(ditto, config);
}