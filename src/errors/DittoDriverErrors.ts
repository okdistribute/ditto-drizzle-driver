/**
 * Custom error classes for Ditto Drizzle Driver
 */

export class DittoDriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DittoDriverError';
  }
}

export class DittoUnsupportedConstraintError extends DittoDriverError {
  constructor(constraintType: string, details?: string) {
    const message = `Unsupported constraint: ${constraintType}${details ? `. ${details}` : ''}`;
    super(message);
    this.name = 'DittoUnsupportedConstraintError';
  }
}

export class DittoUnsupportedOperationError extends DittoDriverError {
  constructor(operation: string, suggestion?: string) {
    const message = `Unsupported SQL operation: ${operation}${suggestion ? `. ${suggestion}` : ''}`;
    super(message);
    this.name = 'DittoUnsupportedOperationError';
  }
}

export class DittoSchemaValidationError extends DittoDriverError {
  constructor(message: string) {
    super(message);
    this.name = 'DittoSchemaValidationError';
  }
}