/**
 * Converts a Drizzle query into a compilable query compatible with Ditto's observer patterns.
 * This allows you to use Drizzle queries with reactive data fetching.
 */
export function toCompilableQuery<T>(query: any): {
  compile: () => { sql: string; parameters: any[] };
  execute: () => Promise<T[]>;
} {
  return {
    compile: () => {
      const sql = query.toSQL();
      return {
        sql: sql.sql,
        parameters: sql.params
      };
    },
    execute: async () => {
      const result = await query.execute();
      return Array.isArray(result) ? result : [result];
    }
  };
}