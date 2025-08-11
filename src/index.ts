import { 
  wrapDittoWithDrizzle, 
  type DrizzleQuery, 
  type DittoSQLiteDatabase,
  type ObserveOptions,
  type QueryObserver,
  type ObserveCallback
} from './sqlite/DittoSQLiteDatabase';
import { toCompilableQuery } from './utils/compilableQuery';
import {
  DittoDriverError,
  DittoUnsupportedConstraintError,
  DittoUnsupportedOperationError,
  DittoSchemaValidationError
} from './errors/DittoDriverErrors';

export {
  wrapDittoWithDrizzle,
  DittoSQLiteDatabase,
  DrizzleQuery,
  toCompilableQuery,
  ObserveOptions,
  QueryObserver,
  ObserveCallback,
  // Error classes
  DittoDriverError,
  DittoUnsupportedConstraintError,
  DittoUnsupportedOperationError,
  DittoSchemaValidationError
};

// Re-export types that users might need
export type { DittoSQLiteTransactionConfig } from './sqlite/DittoSQLiteBaseSession';