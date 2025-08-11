import { sqlToDql } from '../src/utils/sqlToDql';

describe('Edge Cases', () => {
  describe('Complex WHERE Conditions', () => {
    it('should handle multiple AND conditions', () => {
      const sql = 'SELECT * FROM users WHERE age > ? AND name = ? AND active = ?';
      const params = [18, 'John', true];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users WHERE age > :arg1 AND name = :arg2 AND active = :arg3');
      expect(result.args).toEqual({ arg1: 18, arg2: 'John', arg3: true });
    });

    it('should handle multiple OR conditions', () => {
      const sql = 'SELECT * FROM users WHERE status = ? OR status = ? OR status = ?';
      const params = ['pending', 'active', 'suspended'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users WHERE status = :arg1 OR status = :arg2 OR status = :arg3');
      expect(result.args).toEqual({ arg1: 'pending', arg2: 'active', arg3: 'suspended' });
    });

    it('should handle mixed AND/OR conditions', () => {
      const sql = 'SELECT * FROM users WHERE (age > ? AND age < ?) OR (status = ? AND verified = ?)';
      const params = [18, 65, 'premium', true];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users WHERE (age > :arg1 AND age < :arg2) OR (status = :arg3 AND verified = :arg4)');
      expect(result.args).toEqual({ arg1: 18, arg2: 65, arg3: 'premium', arg4: true });
    });

    it('should handle LIKE patterns', () => {
      const sql = 'SELECT * FROM users WHERE name LIKE ? OR email LIKE ?';
      const params = ['%john%', '%@example.com'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users WHERE name LIKE :arg1 OR email LIKE :arg2');
      expect(result.args).toEqual({ arg1: '%john%', arg2: '%@example.com' });
    });

    it('should handle NOT conditions', () => {
      const sql = 'SELECT * FROM users WHERE NOT (status = ? OR deleted = ?)';
      const params = ['inactive', true];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users WHERE NOT (status = :arg1 OR deleted = :arg2)');
      expect(result.args).toEqual({ arg1: 'inactive', arg2: true });
    });

    it('should handle comparison operators', () => {
      const sql = 'SELECT * FROM products WHERE price >= ? AND price <= ? AND stock > ?';
      const params = [10.99, 99.99, 0];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM products WHERE price >= :arg1 AND price <= :arg2 AND stock > :arg3');
      expect(result.args).toEqual({ arg1: 10.99, arg2: 99.99, arg3: 0 });
    });
  });

  describe('Boundary Values', () => {
    it('should handle maximum integer values', () => {
      const sql = 'INSERT INTO numbers (value) VALUES (?)';
      const params = [Number.MAX_SAFE_INTEGER];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { value: Number.MAX_SAFE_INTEGER } });
    });

    it('should handle minimum integer values', () => {
      const sql = 'INSERT INTO numbers (value) VALUES (?)';
      const params = [Number.MIN_SAFE_INTEGER];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { value: Number.MIN_SAFE_INTEGER } });
    });

    it('should handle floating point precision', () => {
      const sql = 'UPDATE products SET price = ? WHERE id = ?';
      const params = [0.1 + 0.2, 'product-1']; // Classic floating point issue
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE products SET price = :arg1 WHERE _id = :arg2');
      expect(result.args?.arg1).toBeCloseTo(0.3, 10);
      expect(result.args?.arg2).toBe('product-1');
    });

    it('should handle zero values', () => {
      const sql = 'INSERT INTO data (int_val, float_val, str_val) VALUES (?, ?, ?)';
      const params = [0, 0.0, '0'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_val: 0, float_val: 0.0, str_val: '0' } });
    });

    it('should handle negative values', () => {
      const sql = 'UPDATE accounts SET balance = ? WHERE id = ?';
      const params = [-1000.50, 'account-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE accounts SET balance = :arg1 WHERE _id = :arg2');
      expect(result.args).toEqual({ arg1: -1000.50, arg2: 'account-1' });
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle mixed case table names', () => {
      const sql = 'SELECT * FROM "UserProfiles" WHERE "UserId" = ?';
      const params = ['user-123'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM UserProfiles WHERE UserId = :arg1');
    });

    it('should handle case in SQL keywords', () => {
      const sql = 'sElEcT * fRoM users WhErE id = ?';
      const params = ['user-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('sElEcT * fRoM users WhErE _id = :arg1');
    });

    it('should preserve case in string literals', () => {
      const sql = 'UPDATE users SET name = ? WHERE email = ?';
      const params = ['John DOE', 'JOHN@EXAMPLE.COM'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ 
        arg1: 'John DOE', 
        arg2: 'JOHN@EXAMPLE.COM' 
      });
    });
  });

  describe('Reserved Keywords', () => {
    it('should handle SQL keywords as values', () => {
      const sql = 'INSERT INTO keywords (word, type) VALUES (?, ?)';
      const params = ['SELECT', 'FROM'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { word: 'SELECT', type: 'FROM' } });
    });

    it('should handle DQL keywords as values', () => {
      const sql = 'UPDATE docs SET content = ? WHERE id = ?';
      const params = ['DOCUMENTS { test: 123 }', 'doc-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE docs SET content = :arg1 WHERE _id = :arg2');
      expect(result.args).toEqual({ 
        arg1: 'DOCUMENTS { test: 123 }', 
        arg2: 'doc-1' 
      });
    });
  });

  describe('Multiple Table References', () => {
    it('should handle table aliases', () => {
      const sql = 'SELECT u.name, u.email FROM users u WHERE u.id = ?';
      const params = ['user-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toContain('u.name');
      expect(result.query).toContain('u.email');
      expect(result.query).toContain('u._id = :arg1');
    });

    it('should handle fully qualified column names', () => {
      const sql = 'SELECT users.name, profiles.bio FROM users, profiles WHERE users.id = ? AND profiles.user_id = ?';
      // Note: DQL will map users.id to users._id
      const params = ['user-1', 'user-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toContain('users.name');
      expect(result.query).toContain('profiles.bio');
      expect(result.query).toContain('users._id = :arg1');
      expect(result.query).toContain('profiles.user_id = :arg2');
    });
  });

  describe('ORDER BY and LIMIT', () => {
    it('should handle ORDER BY with multiple columns', () => {
      const sql = 'SELECT * FROM users ORDER BY created_at DESC, name ASC';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users ORDER BY created_at DESC, name ASC');
    });

    it('should handle LIMIT and OFFSET', () => {
      const sql = 'SELECT * FROM users LIMIT ? OFFSET ?';
      const params = [10, 20];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM users LIMIT :arg1 OFFSET :arg2');
      expect(result.args).toEqual({ arg1: 10, arg2: 20 });
    });

    it('should handle ORDER BY with LIMIT', () => {
      const sql = 'SELECT * FROM posts ORDER BY views DESC LIMIT ?';
      const params = [5];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT * FROM posts ORDER BY views DESC LIMIT :arg1');
    });
  });

  describe('Array-like Operations', () => {
    it('should handle IN clause simulation', () => {
      // Note: DQL might not support IN directly, but we test the translation
      const sql = 'SELECT * FROM users WHERE status = ? OR status = ? OR status = ?';
      const params = ['active', 'pending', 'verified'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ 
        arg1: 'active', 
        arg2: 'pending', 
        arg3: 'verified' 
      });
    });

    it('should handle multiple value INSERT', () => {
      // Single row insert (Drizzle generates separate statements for multi-row)
      const sql = 'INSERT INTO users (id, name, age) VALUES (?, ?, ?)';
      const params = ['user-1', 'Alice', 30];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('INSERT INTO users DOCUMENTS (:doc)');
      expect(result.args?.doc).toEqual({ _id: 'user-1', name: 'Alice', age: 30 });
    });
  });

  describe('Complex Data Scenarios', () => {
    it('should handle JSON-like strings', () => {
      const sql = 'UPDATE documents SET data = ? WHERE id = ?';
      const params = ['{"name":"John","age":30,"nested":{"key":"value"}}', 'doc-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE documents SET data = :arg1 WHERE _id = :arg2');
      expect(result.args?.arg1).toContain('{"name":"John"');
      expect(result.args?.arg2).toBe('doc-1');
    });

    it('should handle base64 encoded data', () => {
      const sql = 'INSERT INTO files (name, content) VALUES (?, ?)';
      const base64 = 'SGVsbG8gV29ybGQh'; // "Hello World!" in base64
      const params = ['test.txt', base64];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { name: 'test.txt', content: base64 } });
    });

    it('should handle URL strings', () => {
      const sql = 'UPDATE links SET url = ? WHERE id = ?';
      const params = ['https://example.com/path?query=value&other=123', 'link-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE links SET url = :arg1 WHERE _id = :arg2');
      expect(result.args?.arg1).toContain('https://example.com');
      expect(result.args?.arg2).toBe('link-1');
    });

    it('should handle email addresses', () => {
      const sql = 'INSERT INTO contacts (email) VALUES (?)';
      const params = ['user+tag@sub.example.co.uk'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { email: 'user+tag@sub.example.co.uk' } });
    });
  });

  describe('White Space Handling', () => {
    it('should handle leading/trailing spaces in values', () => {
      const sql = 'INSERT INTO data (value) VALUES (?)';
      const params = ['  spaces around  '];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { value: '  spaces around  ' } });
    });

    it('should handle newlines in values', () => {
      const sql = 'UPDATE posts SET content = ? WHERE id = ?';
      const params = ['Line 1\nLine 2\r\nLine 3', 'post-1'];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('UPDATE posts SET content = :arg1 WHERE _id = :arg2');
      expect(result.args?.arg1).toContain('\n');
      expect(result.args?.arg2).toBe('post-1');
    });

    it('should handle tabs in values', () => {
      const sql = 'INSERT INTO data (tsv) VALUES (?)';
      const params = ['col1\tcol2\tcol3'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { tsv: 'col1\tcol2\tcol3' } });
    });
  });
});