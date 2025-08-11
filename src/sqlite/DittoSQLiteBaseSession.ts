import { Store, Transaction } from '@dittolive/ditto';
import { entityKind } from 'drizzle-orm/entity';
import { NoopLogger } from 'drizzle-orm/logger';
import { SQLiteSession, SQLiteTransaction } from 'drizzle-orm/sqlite-core/session';
import type { Query } from 'drizzle-orm/sql/sql';
import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';
import type { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { Logger } from 'drizzle-orm/logger';
import type { QueryResult } from '@dittolive/ditto';
import { DittoSQLitePreparedQuery } from './DittoSQLitePreparedQuery';

export interface DittoSQLiteTransactionConfig {
  behavior?: 'deferred' | 'immediate' | 'exclusive';
  accessMode?: 'read write' | 'read only';
}

export class DittoSQLiteTransaction extends SQLiteTransaction<'async', QueryResult, any, any> {
  static override readonly [entityKind] = 'DittoSQLiteTransaction';
}

export class DittoSQLiteBaseSession extends SQLiteSession<'async', QueryResult, Record<string, unknown>, any> {
  static override readonly [entityKind] = 'DittoSQLiteBaseSession';
  
  protected store: Store | Transaction;
  protected dialect: SQLiteAsyncDialect;
  protected schema?: {
    fullSchema: Record<string, unknown>;
    schema: any;
    tableNamesMap: Record<string, string>;
  };
  protected options: { logger?: Logger };
  protected logger: Logger;

  constructor(
    store: Store | Transaction,
    dialect: SQLiteAsyncDialect,
    schema?: {
      fullSchema: Record<string, unknown>;
      schema: any;
      tableNamesMap: Record<string, string>;
    },
    options: { logger?: Logger } = {}
  ) {
    super(dialect);
    this.store = store;
    this.dialect = dialect;
    this.schema = schema;
    this.options = options;
    this.logger = options.logger ?? new NoopLogger();
  }

  override prepareQuery(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: 'run' | 'all' | 'get',
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
    _queryMetadata?: any,
    _cacheConfig?: any
  ): DittoSQLitePreparedQuery {
    return new DittoSQLitePreparedQuery(
      this.store,
      query,
      this.logger,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper
    );
  }

  override transaction(_transaction: any, _config?: any): any {
    throw new Error('Nested transactions are not supported');
  }
}