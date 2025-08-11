import { sqlToDql } from '../src/utils/sqlToDql';

describe('Aggregates and Projections', () => {
  describe('Aggregate Functions', () => {
    it('should handle COUNT(*)', () => {
      const sql = 'SELECT COUNT(*) FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT COUNT(*) FROM users');
    });

    it('should handle COUNT with field', () => {
      const sql = 'SELECT COUNT(name) FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT COUNT(name) FROM users');
    });

    it('should handle COUNT DISTINCT', () => {
      const sql = 'SELECT COUNT(DISTINCT status) FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT COUNT(DISTINCT status) FROM users');
    });

    it('should handle SUM', () => {
      const sql = 'SELECT SUM(amount) FROM transactions';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT SUM(amount) FROM transactions');
    });

    it('should handle AVG', () => {
      const sql = 'SELECT AVG(age) FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT AVG(age) FROM users');
    });

    it('should handle MIN and MAX', () => {
      const sql = 'SELECT MIN(price), MAX(price) FROM products';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT MIN(price), MAX(price) FROM products');
    });

    it('should handle multiple aggregates', () => {
      const sql = 'SELECT COUNT(*), SUM(amount), AVG(amount) FROM orders';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT COUNT(*), SUM(amount), AVG(amount) FROM orders');
    });

    it('should handle aggregates with WHERE clause', () => {
      const sql = 'SELECT COUNT(*) FROM users WHERE active = ?';
      const params = [true];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT COUNT(*) FROM users WHERE active = :arg1');
      expect(result.args).toEqual({ arg1: true });
    });
  });

  describe('Projections', () => {
    it('should handle specific column selection', () => {
      const sql = 'SELECT name, email, age FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT name, email, age FROM users');
    });

    it('should handle column aliases', () => {
      const sql = 'SELECT name AS user_name, email AS user_email FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT name AS user_name, email AS user_email FROM users');
    });

    it('should handle expressions in projections', () => {
      const sql = 'SELECT name, age * 2 AS double_age FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT name, age * 2 AS double_age FROM users');
    });

    it('should handle DISTINCT projections', () => {
      const sql = 'SELECT DISTINCT status FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT DISTINCT status FROM users');
    });

    it('should map id to _id in projections', () => {
      const sql = 'SELECT id, name FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT _id, name FROM users');
    });
  });

  describe('GROUP BY and HAVING', () => {
    it('should handle GROUP BY single column', () => {
      const sql = 'SELECT status, COUNT(*) FROM users GROUP BY status';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT status, COUNT(*) FROM users GROUP BY status');
    });

    it('should handle GROUP BY multiple columns', () => {
      const sql = 'SELECT status, department, COUNT(*) FROM users GROUP BY status, department';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT status, department, COUNT(*) FROM users GROUP BY status, department');
    });

    it('should handle GROUP BY with aggregates', () => {
      const sql = 'SELECT category, SUM(price) AS total, AVG(price) AS average FROM products GROUP BY category';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT category, SUM(price) AS total, AVG(price) AS average FROM products GROUP BY category');
    });

    it('should handle HAVING clause', () => {
      const sql = 'SELECT status, COUNT(*) FROM users GROUP BY status HAVING COUNT(*) > ?';
      const params = [5];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT status, COUNT(*) FROM users GROUP BY status HAVING COUNT(*) > :arg1');
      expect(result.args).toEqual({ arg1: 5 });
    });

    it('should handle HAVING with aggregate functions', () => {
      const sql = 'SELECT category, SUM(price) FROM products GROUP BY category HAVING SUM(price) > ? AND COUNT(*) > ?';
      const params = [1000, 10];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT category, SUM(price) FROM products GROUP BY category HAVING SUM(price) > :arg1 AND COUNT(*) > :arg2');
      expect(result.args).toEqual({ arg1: 1000, arg2: 10 });
    });

    it('should map id to _id in GROUP BY', () => {
      const sql = 'SELECT id, COUNT(*) FROM users GROUP BY id';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT _id, COUNT(*) FROM users GROUP BY _id');
    });
  });

  describe('Complex Queries', () => {
    it('should handle complex query with all features', () => {
      const sql = `
        SELECT 
          status,
          COUNT(*) AS user_count,
          AVG(age) AS avg_age,
          MIN(created_at) AS first_user,
          MAX(created_at) AS last_user
        FROM users
        WHERE active = ?
        GROUP BY status
        HAVING COUNT(*) > ?
        ORDER BY user_count DESC
        LIMIT ?
      `;
      const params = [true, 5, 10];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toContain('COUNT(*) AS user_count');
      expect(result.query).toContain('AVG(age) AS avg_age');
      expect(result.query).toContain('WHERE active = :arg1');
      expect(result.query).toContain('GROUP BY status');
      expect(result.query).toContain('HAVING COUNT(*) > :arg2');
      expect(result.query).toContain('LIMIT :arg3');
      expect(result.args).toEqual({ arg1: true, arg2: 5, arg3: 10 });
    });

    it('should handle subqueries in projections', () => {
      const sql = 'SELECT name, (SELECT COUNT(*) FROM orders WHERE user_id = users.id) AS order_count FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      // Note: subqueries may need special handling depending on DQL support
      expect(result.query).toContain('user_id = users._id');
    });

    it('should not replace id in MID function', () => {
      const sql = 'SELECT MID(name, 1, 3) FROM users';
      const params: any[] = [];
      
      const result = sqlToDql(sql, params);
      expect(result.query).toBe('SELECT MID(name, 1, 3) FROM users');
    });
  });
});