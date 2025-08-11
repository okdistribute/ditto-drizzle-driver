import { sqlToDql } from '../src/utils/sqlToDql';

describe('SQL to DQL Translation', () => {
  describe('SELECT statements', () => {
    it('should translate simple SELECT', () => {
      const sql = 'SELECT * FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('SELECT * FROM users');
      expect(result.args).toBeUndefined();
    });

    it('should translate SELECT with WHERE clause and parameters', () => {
      const sql = 'SELECT * FROM users WHERE name = ? AND age > ?';
      const params = ['John', 25];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('SELECT * FROM users WHERE name = :arg1 AND age > :arg2');
      expect(result.args).toEqual({ arg1: 'John', arg2: 25 });
    });

    it('should remove quotes from identifiers', () => {
      const sql = 'SELECT "users"."name", "users"."age" FROM "users" WHERE "users"."id" = ?';
      const params = [123];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('SELECT users.name, users.age FROM users WHERE users._id = :arg1');
      expect(result.args).toEqual({ arg1: 123 });
    });
  });

  describe('INSERT statements', () => {
    it('should translate INSERT with single row', () => {
      const sql = 'INSERT INTO users (name, age) VALUES (?, ?)';
      const params = ['Alice', 30];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('INSERT INTO users DOCUMENTS (:doc)');
      expect(result.args).toEqual({ doc: { name: 'Alice', age: 30 } });
    });

    it('should handle quoted column names', () => {
      const sql = 'INSERT INTO "users" ("name", "age", "email") VALUES (?, ?, ?)';
      const params = ['Bob', 25, 'bob@example.com'];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('INSERT INTO users DOCUMENTS (:doc)');
      expect(result.args).toEqual({ doc: { name: 'Bob', age: 25, email: 'bob@example.com' } });
    });
  });

  describe('UPDATE statements', () => {
    it('should translate UPDATE with WHERE clause', () => {
      const sql = 'UPDATE users SET name = ?, age = ? WHERE id = ?';
      const params = ['Charlie', 35, 456];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('UPDATE users SET name = :arg1, age = :arg2 WHERE _id = :arg3');
      expect(result.args).toEqual({ arg1: 'Charlie', arg2: 35, arg3: 456 });
    });

    it('should handle quoted identifiers', () => {
      const sql = 'UPDATE "users" SET "name" = ? WHERE "id" = ?';
      const params = ['David', 789];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('UPDATE users SET name = :arg1 WHERE _id = :arg2');
      expect(result.args).toEqual({ arg1: 'David', arg2: 789 });
    });
  });

  describe('DELETE statements', () => {
    it('should translate DELETE with parameters', () => {
      const sql = 'DELETE FROM users WHERE id = ?';
      const params = [999];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('DELETE FROM users WHERE _id = :arg1');
      expect(result.args).toEqual({ arg1: 999 });
    });

    it('should handle complex WHERE conditions', () => {
      const sql = 'DELETE FROM users WHERE age > ? AND name LIKE ?';
      const params = [50, '%test%'];
      
      const result = sqlToDql(sql, params);
      
      expect(result.query).toBe('DELETE FROM users WHERE age > :arg1 AND name LIKE :arg2');
      expect(result.args).toEqual({ arg1: 50, arg2: '%test%' });
    });
  });

  describe('Error handling', () => {
    it('should throw error for unsupported statements', () => {
      const sql = 'CREATE TABLE users (id INTEGER PRIMARY KEY)';
      const params: any[] = [];
      
      expect(() => sqlToDql(sql, params)).toThrow('Unsupported SQL statement');
    });

    it('should throw error for malformed INSERT', () => {
      const sql = 'INSERT INTO users';
      const params: any[] = [];
      
      expect(() => sqlToDql(sql, params)).toThrow('Unable to parse INSERT statement');
    });
  });
});