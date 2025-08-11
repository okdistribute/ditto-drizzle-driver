import { Ditto } from '@dittolive/ditto';
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

export type DrizzleQuery<T> = {
  toSQL(): { sql: string; params: any[] };
  execute(): Promise<T | T[]>;
};

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

  // Optional: Add watch functionality similar to PowerSync
  // This would use Ditto's StoreObserver API
  // watch<T>(query: DrizzleQuery<T>, handler: (data: T[]) => void): void {
  //   // Implementation would go here
  // }
}

export function wrapDittoWithDrizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
  ditto: Ditto,
  config?: DrizzleConfig<TSchema>
): DittoSQLiteDatabase<TSchema> {
  return new DittoSQLiteDatabase(ditto, config);
}