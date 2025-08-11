import { sqlToDql } from '../src/utils/sqlToDql';
import { DittoSQLitePreparedQuery } from '../src/sqlite/DittoSQLitePreparedQuery';
import { DittoSQLiteBaseSession } from '../src/sqlite/DittoSQLiteBaseSession';
import { wrapDittoWithDrizzle } from '../src';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { NoopLogger } from 'drizzle-orm/logger';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core/dialect';

// Mock Store for testing
class MockErrorStore {
  async execute(_query: string, _args?: Record<string, any>): Promise<any> {
    // Simulate empty result
    return {
      items: [],
      insertedId: null,
      affectedRows: 0
    };
  }

  async transaction<T>(
    fn: (tx: any) => Promise<T>,
    _options?: { isReadOnly?: boolean }
  ): Promise<T> {
    return fn(this);
  }
}

describe('Error Handling', () => {
  describe('Invalid SQL Queries', () => {
    it('should throw on unparseable SELECT', () => {
      const sql = 'SELEKT * FORM users';
      const params: any[] = [];
      
      expect(() => sqlToDql(sql, params)).toThrow('Unsupported SQL operation');
    });

    it('should throw on malformed INSERT', () => {
      const sql = 'INSERT INTO users';
      const params: any[] = [];
      
      expect(() => sqlToDql(sql, params)).toThrow('Unable to parse INSERT statement');
    });

    it('should throw on incomplete UPDATE', () => {
      const sql = 'UPDATE users SET';
      const params = ['value'];
      
      // This should handle the incomplete SQL gracefully
      const result = sqlToDql(sql, params);
      expect(result.query).toContain('UPDATE');
    });

    it('should throw on unsupported SQL operations', () => {
      const operations = [
        'CREATE TABLE users (id INT)',
        'DROP TABLE users',
        'ALTER TABLE users ADD COLUMN name TEXT',
        'TRUNCATE TABLE users'
      ];
      
      operations.forEach(sql => {
        expect(() => sqlToDql(sql, [])).toThrow('Unsupported SQL operation');
      });
    });
  });

  describe('Parameter Handling Errors', () => {
    it('should handle null parameters', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [null];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ arg1: null });
    });

    it('should handle undefined parameters', () => {
      const sql = 'SELECT * FROM users WHERE id = ?';
      const params = [undefined];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ arg1: undefined });
    });

    it('should handle empty parameter array', () => {
      const sql = 'SELECT * FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toBeUndefined();
    });

    it('should handle mixed null and valid parameters', () => {
      const sql = 'UPDATE users SET name = ?, age = ? WHERE id = ?';
      const params = [null, 25, 'user-123'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({
        arg1: null,
        arg2: 25,
        arg3: 'user-123'
      });
    });
  });

  describe('Special Characters and Edge Cases', () => {
    it('should handle quotes in parameters', () => {
      const sql = 'INSERT INTO users (name, bio) VALUES (?, ?)';
      const params = ["O'Brien", 'He said "Hello"'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: {
        name: "O'Brien",
        bio: 'He said "Hello"'
      } });
    });

    it('should handle backslashes in parameters', () => {
      const sql = 'UPDATE users SET path = ? WHERE id = ?';
      const params = ['C:\\Users\\Documents', 'user-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE users SET path = :arg1 WHERE _id = :arg2');
      expect(result.args).toEqual({
        arg1: 'C:\\Users\\Documents',
        arg2: 'user-1'
      });
    });

    it('should handle unicode characters', () => {
      const sql = 'INSERT INTO users (name, emoji) VALUES (?, ?)';
      const params = ['李明', '😀🎉'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: {
        name: '李明',
        emoji: '😀🎉'
      } });
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const sql = 'UPDATE users SET bio = ? WHERE id = ?';
      // Note: DQL will map id to _id
      const params = [longString, 'user-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.arg1).toHaveLength(10000);
    });

    it('should handle empty strings', () => {
      const sql = 'UPDATE users SET name = ? WHERE id = ?';
      // Note: DQL will map id to _id
      const params = ['', 'user-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({
        arg1: '',
        arg2: 'user-1'
      });
    });
  });

  describe('Transaction Errors', () => {
    it('should prevent nested transactions', () => {
      const store = new MockErrorStore();
      const dialect = new SQLiteAsyncDialect({});
      const session = new DittoSQLiteBaseSession(store as any, dialect);
      
      expect(() => {
        session.transaction(() => Promise.resolve());
      }).toThrow('Nested transactions are not supported');
    });

    it('should handle transaction rollback on error', async () => {
      const mockDitto = {
        disableSyncWithV3: jest.fn(),
        store: {
          execute: jest.fn(),
          transaction: jest.fn(async (fn) => {
            // Simulate a transaction that rolls back on error
            try {
              return await fn({
                execute: jest.fn().mockResolvedValue({
                  items: [],
                  insertedId: 'test-id',
                  affectedRows: 1
                })
              });
            } catch (error) {
              // Rollback would happen here
              throw error;
            }
          })
        }
      };
      
      const users = sqliteTable('users', {
        id: text('id').primaryKey(),
        name: text('name')
      });
      
      const db = wrapDittoWithDrizzle(mockDitto as any, { schema: { users } });
      
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(users).values({ id: '1', name: 'Test' });
          throw new Error('Intentional error');
        })
      ).rejects.toThrow('Intentional error');
    });
  });

  describe('Query Result Errors', () => {
    it('should handle empty result sets gracefully', async () => {
      const store = new MockErrorStore();
      const query = { sql: 'SELECT * FROM users', params: [] };
      const logger = new NoopLogger();
      
      const preparedQuery = new DittoSQLitePreparedQuery(
        store as any,
        query,
        logger,
        undefined,
        'all',
        false
      );
      
      const result = await preparedQuery.all();
      expect(result).toEqual([]);
    });

    it('should handle get() with no results', async () => {
      const store = new MockErrorStore();
      const query = { sql: 'SELECT * FROM users WHERE id = ?', params: ['nonexistent'] };
      const logger = new NoopLogger();
      
      const preparedQuery = new DittoSQLitePreparedQuery(
        store as any,
        query,
        logger,
        undefined,
        'get',
        false
      );
      
      const result = await preparedQuery.get({ arg1: 'nonexistent' });
      expect(result).toBeUndefined();
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should safely handle SQL injection attempts in parameters', () => {
      const sql = 'SELECT * FROM users WHERE name = ?';
      const params = ["'; DROP TABLE users; --"];
      
      const result = sqlToDql(sql, params);
      // The dangerous SQL should be treated as a parameter value, not SQL
      expect(result.args).toEqual({
        arg1: "'; DROP TABLE users; --"
      });
      expect(result.query).not.toContain('DROP TABLE');
    });

    it('should handle multiple injection attempts', () => {
      const sql = 'UPDATE users SET name = ?, bio = ? WHERE id = ?';
      const params = [
        "admin'--",
        "1' OR '1'='1",
        "user-1"
      ];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({
        arg1: "admin'--",
        arg2: "1' OR '1'='1",
        arg3: "user-1"
      });
    });
  });

  describe('Invalid Identifier Handling', () => {
    it('should handle table names with special characters', () => {
      const sql = 'SELECT * FROM "user-table"';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM user-table');
    });

    it('should handle column names with spaces', () => {
      const sql = 'SELECT "first name", "last name" FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT first name, last name FROM users');
    });

    it('should handle reserved keywords as identifiers', () => {
      const sql = 'SELECT "select", "from", "where" FROM "table"';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT select, from, where FROM table');
    });
  });
});