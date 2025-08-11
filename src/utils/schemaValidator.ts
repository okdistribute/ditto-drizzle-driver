/**
 * Schema validator to enforce Ditto compatibility
 */

import { 
  DittoSchemaValidationError, 
  DittoUnsupportedConstraintError 
} from '../errors/DittoDriverErrors';

export function validateDittoSchema(schema?: Record<string, any>) {
  if (!schema) return;
  
  const unsupportedFeatures: string[] = [];
  const uniqueColumns: string[] = [];
  const foreignKeyColumns: string[] = [];
  
  for (const key in schema) {
    const table = schema[key];
    if (table && typeof table === 'object') {
      // Skip non-table objects (like relations)
      const isTable = table._ || Object.values(table).some((col: any) => col && col.name);
      if (!isTable) continue;
      
      const tableName = (table._ && table._.name) || key;
      
      // Check each column in the table
      for (const columnKey in table) {
        if (columnKey === '_') continue; // Skip metadata
        
        const column = table[columnKey];
        if (column && typeof column === 'object') {
          // Check if it's a column definition (has name property)
          if (column.name) {
            // Check for unique constraints
            if (column.isUnique && column.name !== 'id' && column.name !== '_id') {
              uniqueColumns.push(`${tableName}.${column.name}`);
            }
            
            // Check for foreign key references
            // References can be in the config or as a function on the column
            if (column.references || column.config?.references || 
                (column.config && typeof column.config === 'object' && 'references' in column.config)) {
              foreignKeyColumns.push(`${tableName}.${column.name}`);
            }
            
            // Check for check constraints
            if (column.check) {
              unsupportedFeatures.push(`CHECK constraint on ${tableName}.${column.name}`);
            }
          }
        }
      }
      
      // Note: We can't detect composite indexes at schema validation time since
      // Drizzle doesn't expose index definitions in the table metadata.
      // Composite indexes will be caught at runtime when CREATE INDEX is executed.
    }
  }
  
  // Build error message if any unsupported features found
  if (uniqueColumns.length > 0 || foreignKeyColumns.length > 0 || unsupportedFeatures.length > 0) {
    let errorMessage = 'Ditto does not support the following SQL features found in your schema:\n\n';
    
    if (uniqueColumns.length > 0) {
      throw new DittoUnsupportedConstraintError(
        'UNIQUE constraints',
        `Ditto only enforces uniqueness on the id/_id field. Found UNIQUE constraints on: ${uniqueColumns.join(', ')}. ` +
        `These constraints will not be enforced at the database level.`
      );
    }
    
    if (foreignKeyColumns.length > 0) {
      throw new DittoUnsupportedConstraintError(
        'FOREIGN KEY constraints',
        `Ditto does not support foreign key constraints or referential integrity. Found references on: ${foreignKeyColumns.join(', ')}. ` +
        `You must handle relationships at the application level.`
      );
    }
    
    if (unsupportedFeatures.length > 0) {
      throw new DittoSchemaValidationError(
        errorMessage + unsupportedFeatures.join('\n')
      );
    }
  }
}