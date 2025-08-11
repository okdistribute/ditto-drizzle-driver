import { Store, Transaction, QueryResult as DittoQueryResult } from '@dittolive/ditto';
import { Column, getTableName, SQL } from 'drizzle-orm';
import { entityKind, is } from 'drizzle-orm/entity';
import { fillPlaceholders } from 'drizzle-orm/sql/sql';
import { SQLitePreparedQuery } from 'drizzle-orm/sqlite-core/session';
import type { Query } from 'drizzle-orm/sql/sql';
import type { Logger } from 'drizzle-orm/logger';
import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';
import { sqlToDql, mapDqlResultToSql } from '../utils/sqlToDql';

export class DittoSQLitePreparedQuery extends SQLitePreparedQuery<any> {
  static override readonly [entityKind] = 'DittoSQLitePreparedQuery';
  
  private store: Store | Transaction;
  protected override query: Query;
  private logger: Logger;
  private fields?: SelectedFieldsOrdered;
  private _isResponseInArrayMode: boolean;
  private customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

  constructor(
    store: Store | Transaction,
    query: Query,
    logger: Logger,
    fields?: SelectedFieldsOrdered,
    executeMethod?: 'run' | 'all' | 'get',
    _isResponseInArrayMode?: boolean,
    customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown
  ) {
    super('async', executeMethod || 'all', query);
    this.store = store;
    this.query = query;
    this.logger = logger;
    this.fields = fields;
    this._isResponseInArrayMode = _isResponseInArrayMode || false;
    this.customResultMapper = customResultMapper;
  }

  async run(placeholderValues?: Record<string, unknown>): Promise<DittoQueryResult> {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    
    // Convert SQL to DQL
    const dqlQuery = sqlToDql(this.query.sql, params);
    
    // Execute the DQL query
    const result = await this.store.execute(dqlQuery.query, dqlQuery.args);
    
    return result;
  }

  async all(placeholderValues?: Record<string, unknown>): Promise<any[]> {
    const { fields, query, logger, customResultMapper } = this;
    
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      
      // Convert SQL to DQL
      const dqlQuery = sqlToDql(query.sql, params);
      
      // Execute the DQL query
      const result = await this.store.execute(dqlQuery.query, dqlQuery.args);
      
      // Return the items from the query result
      return result.items.map(item => mapDqlResultToSql(item.value));
    }
    
    const rows = await this.values(placeholderValues);
    
    // Check if this is already processed aggregate data (has expected field names)
    if (rows.length > 0 && fields) {
      const firstRow = rows[0];
      const expectedFieldName = fields[0].path[fields[0].path.length - 1];
      if (typeof firstRow === 'object' && !Array.isArray(firstRow) && expectedFieldName in firstRow) {
        // Already processed aggregate results - return as is
        return rows;
      }
    }
    
    if (customResultMapper) {
      const mappedResult = customResultMapper(rows as unknown[][]);
      return Array.isArray(mappedResult) ? mappedResult : [mappedResult];
    }
    
    return rows.map((row) => mapResultRow(fields!, row as any[], undefined));
  }

  async get(placeholderValues?: Record<string, unknown>): Promise<any> {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    
    const { fields, customResultMapper } = this;
    
    if (!fields && !customResultMapper) {
      // Convert SQL to DQL  
      const dqlQuery = sqlToDql(this.query.sql, params);
      
      // Add LIMIT 1 if not present
      if (!dqlQuery.query.toUpperCase().includes('LIMIT')) {
        dqlQuery.query += ' LIMIT 1';
      }
      
      // Execute the DQL query
      const result = await this.store.execute(dqlQuery.query, dqlQuery.args);
      
      // Return the first item
      return result.items.length > 0 ? mapDqlResultToSql(result.items[0].value) : undefined;
    }
    
    const rows = await this.values(placeholderValues);
    const row = (rows as any[])[0];
    
    if (!row) {
      return undefined;
    }
    
    if (customResultMapper) {
      const mappedResult = customResultMapper(rows as unknown[][]);
      return Array.isArray(mappedResult) ? mappedResult : [mappedResult];
    }
    
    return mapResultRow(fields!, row, undefined);
  }

  async values(placeholderValues?: Record<string, unknown>): Promise<any[]> {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    
    // Convert SQL to DQL
    const dqlQuery = sqlToDql(this.query.sql, params);
    
    // Execute the DQL query
    const result = await this.store.execute(dqlQuery.query, dqlQuery.args);
    
    // Check if this is an aggregate query (result has items with value containing ($n) keys)
    const firstItem = result.items[0];
    const valueObj = firstItem?.value;
    const isAggregateQuery = result.items.length > 0 && 
      valueObj && 
      typeof valueObj === 'object' &&
      Object.keys(valueObj).some(key => key.match(/^\(\$\d+\)$/));
    
    if (isAggregateQuery) {
      // Handle aggregate results (may include GROUP BY fields)
      const mappedResults = result.items.map(item => {
        const resultValues = item.value as Record<string, any>;
        
        // Map values to field names
        if (this.fields) {
          const mappedResult: Record<string, any> = {};
          
          // First, copy any non-aggregate fields (from GROUP BY)
          for (const key in resultValues) {
            if (!key.match(/^\(\$\d+\)$/)) {
              // This is a regular field (not an aggregate)
              mappedResult[key] = resultValues[key];
            }
          }
          
          // Then map fields based on their position in the SELECT
          this.fields.forEach((field, index) => {
            const fieldName = field.path[field.path.length - 1];
            
            // Skip if this field was already copied (GROUP BY field)
            if (fieldName in mappedResult) {
              return;
            }
            
            // This must be an aggregate or computed field
            // Use 1-based index for ($n) keys
            const aggregateKey = `($${index + 1})`;
            if (aggregateKey in resultValues) {
              mappedResult[fieldName] = resultValues[aggregateKey];
            }
          });
          
          return mappedResult;
        }
        
        // If no fields info, return raw values
        return resultValues;
      });
      return mappedResults;
    }
    
    // Extract values in array format if needed
    if (this._isResponseInArrayMode && this.fields) {
      return result.items.map(item => {
        const obj = mapDqlResultToSql(item.value);
        return this.fields!.map(field => obj[field.path[field.path.length - 1]]);
      });
    }
    
    return result.items.map(item => mapDqlResultToSql(item.value));
  }

  isResponseInArrayMode(): boolean {
    return this._isResponseInArrayMode;
  }
}

/**
 * Maps a flat array of database row values to a result object based on the provided column definitions.
 * This is adapted from PowerSync's implementation.
 */
function mapResultRow(
  columns: SelectedFieldsOrdered,
  row: any[],
  joinsNotNullableMap?: Record<string, boolean>
): any {
  const nullifyMap: Record<string, string | false> = {};
  
  const result = columns.reduce((result: any, { path, field }, columnIndex) => {
    const decoder = getDecoder(field);
    let node = result;
    
    for (const [pathChunkIndex, pathChunk] of path.entries()) {
      if (pathChunkIndex < path.length - 1) {
        if (!(pathChunk in node)) {
          node[pathChunk] = {};
        }
        node = node[pathChunk];
      } else {
        const rawValue = row[columnIndex];
        const value = (node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue));
        updateNullifyMap(nullifyMap, field, path, value, joinsNotNullableMap);
      }
    }
    
    return result;
  }, {});
  
  applyNullifyMap(result, nullifyMap, joinsNotNullableMap);
  
  return result;
}

function getDecoder(field: any): any {
  if (is(field, Column)) {
    return field;
  } else if (is(field, SQL)) {
    return (field as any).decoder || { mapFromDriverValue: (v: any) => v };
  } else {
    return field.sql?.decoder || { mapFromDriverValue: (v: any) => v };
  }
}

function updateNullifyMap(
  nullifyMap: Record<string, string | false>,
  field: any,
  path: string[],
  value: any,
  joinsNotNullableMap?: Record<string, boolean>
): void {
  if (!joinsNotNullableMap || !is(field, Column) || path.length !== 2) {
    return;
  }
  
  const objectName = path[0];
  if (!(objectName in nullifyMap)) {
    nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
  } else if (typeof nullifyMap[objectName] === 'string' && nullifyMap[objectName] !== getTableName(field.table)) {
    nullifyMap[objectName] = false;
  }
}

function applyNullifyMap(
  result: any,
  nullifyMap: Record<string, string | false>,
  joinsNotNullableMap?: Record<string, boolean>
): void {
  if (!joinsNotNullableMap || Object.keys(nullifyMap).length === 0) {
    return;
  }
  
  for (const [objectName, tableName] of Object.entries(nullifyMap)) {
    if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
      result[objectName] = null;
    }
  }
}