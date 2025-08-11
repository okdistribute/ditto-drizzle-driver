import { Store } from '@dittolive/ditto';
import { DittoSQLiteBaseSession, DittoSQLiteTransaction, DittoSQLiteTransactionConfig } from './DittoSQLiteBaseSession';

export class DittoSQLiteSession extends DittoSQLiteBaseSession {
  
  private dittoStore: Store;

  constructor(
    store: Store,
    dialect: any,
    schema?: any,
    options: { logger?: any } = {}
  ) {
    super(store, dialect, schema, options);
    this.dittoStore = store;
  }

  override async transaction<T>(
    transactionFn: (tx: DittoSQLiteTransaction) => Promise<T>,
    config: DittoSQLiteTransactionConfig = {}
  ): Promise<T> {
    const { accessMode = 'read write' } = config;
    const isReadOnly = accessMode === 'read only';
    
    // Use Ditto's transaction API
    const result = await this.dittoStore.transaction(async (dittoTx) => {
      // Create a new session that uses the transaction instead of the store
      const txSession = new DittoSQLiteBaseSession(
        dittoTx,
        this.dialect,
        this.schema,
        this.options
      );
      
      // Create the Drizzle transaction wrapper
      const tx = new DittoSQLiteTransaction(
        'async',
        this.dialect,
        txSession,
        this.schema
      );
      
      try {
        const result = await transactionFn(tx);
        // Return 'commit' to commit the transaction
        return result;
      } catch (error) {
        // Rethrow error - Ditto will handle rollback
        throw error;
      }
    }, { isReadOnly });
    
    return result;
  }
}