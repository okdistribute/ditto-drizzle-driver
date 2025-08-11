import { sqlToDql } from '../src/utils/sqlToDql';
import { wrapDittoWithDrizzle } from '../src';
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

// Test schema with various data types
const dataTypes = sqliteTable('data_types', {
  id: text('id').primaryKey(),
  text_field: text('text_field'),
  int_field: integer('int_field'),
  real_field: real('real_field'),
  blob_field: blob('blob_field'),
  bool_field: integer('bool_field'), // Boolean as 0/1
  json_field: text('json_field'),    // JSON as text
  date_field: text('date_field'),    // Date as ISO string
  nullable_field: text('nullable_field')
});

const schema = { dataTypes };

// Mock Store for data type testing
class DataTypeMockStore {
  private storage: any[] = [];
  
  async execute(query: string, args?: Record<string, any>): Promise<any> {
    const upperQuery = query.toUpperCase();
    
    if (upperQuery.startsWith('INSERT')) {
      // Handle new format: INSERT INTO table DOCUMENTS (:doc) or (:doc1), (:doc2), ...
      const docMatches = query.match(/DOCUMENTS\s+(.*)/i);
      if (docMatches && args) {
        // Extract document parameter names from (:doc1), (:doc2) format
        const docParams = docMatches[1].match(/:\w+/g);
        if (docParams) {
          docParams.forEach(param => {
            const paramName = param.substring(1); // Remove the ':'
            if (args[paramName]) {
              this.storage.push(args[paramName]);
            }
          });
        }
        
        return {
          items: [],
          insertedId: args.doc?._id || args.doc1?._id || 'generated-id',
          affectedRows: docParams ? docParams.length : 1
        };
      }
    }
    
    if (upperQuery.startsWith('SELECT')) {
      return {
        items: this.storage.map(value => ({ value })),
        insertedId: null,
        affectedRows: 0
      };
    }
    
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

describe('Data Type Handling', () => {
  describe('Text Types', () => {
    it('should handle regular text strings', () => {
      const sql = 'INSERT INTO data (text_field) VALUES (?)';
      const params = ['Hello World'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { text_field: 'Hello World' } });
    });
    
    it('should handle empty strings', () => {
      const sql = 'INSERT INTO data (text_field) VALUES (?)';
      const params = [''];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { text_field: '' } });
    });
    
    it('should handle very long text', () => {
      const longText = 'Lorem ipsum '.repeat(1000);
      const sql = 'INSERT INTO data (text_field) VALUES (?)';
      const params = [longText];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.doc.text_field).toHaveLength(longText.length);
    });
    
    it('should handle text with special characters', () => {
      const specialText = "Line 1\nLine 2\tTabbed\r\nWindows line\0Null char";
      const sql = 'INSERT INTO data (text_field) VALUES (?)';
      const params = [specialText];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.doc.text_field).toEqual(specialText);
    });
  });
  
  describe('Integer Types', () => {
    it('should handle positive integers', () => {
      const sql = 'INSERT INTO data (int_field) VALUES (?)';
      const params = [42];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_field: 42 } });
    });
    
    it('should handle negative integers', () => {
      const sql = 'INSERT INTO data (int_field) VALUES (?)';
      const params = [-42];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_field: -42 } });
    });
    
    it('should handle zero', () => {
      const sql = 'INSERT INTO data (int_field) VALUES (?)';
      const params = [0];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_field: 0 } });
    });
    
    it('should handle maximum safe integer', () => {
      const sql = 'INSERT INTO data (int_field) VALUES (?)';
      const params = [Number.MAX_SAFE_INTEGER];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_field: Number.MAX_SAFE_INTEGER } });
    });
    
    it('should handle minimum safe integer', () => {
      const sql = 'INSERT INTO data (int_field) VALUES (?)';
      const params = [Number.MIN_SAFE_INTEGER];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_field: Number.MIN_SAFE_INTEGER } });
    });
  });
  
  describe('Real/Float Types', () => {
    it('should handle decimal numbers', () => {
      const sql = 'INSERT INTO data (real_field) VALUES (?)';
      const params = [3.14159];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { real_field: 3.14159 } });
    });
    
    it('should handle negative decimals', () => {
      const sql = 'INSERT INTO data (real_field) VALUES (?)';
      const params = [-273.15];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { real_field: -273.15 } });
    });
    
    it('should handle very small decimals', () => {
      const sql = 'INSERT INTO data (real_field) VALUES (?)';
      const params = [0.00000001];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { real_field: 0.00000001 } });
    });
    
    it('should handle scientific notation', () => {
      const sql = 'INSERT INTO data (real_field) VALUES (?)';
      const params = [1.23e-10];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { real_field: 1.23e-10 } });
    });
    
    it('should handle infinity values', () => {
      const sql = 'INSERT INTO data (real_field) VALUES (?)';
      const params = [Infinity];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { real_field: Infinity } });
    });
    
    it('should handle NaN', () => {
      const sql = 'INSERT INTO data (real_field) VALUES (?)';
      const params = [NaN];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.doc.real_field).toBeNaN();
    });
  });
  
  describe('Boolean Types (as 0/1)', () => {
    it('should handle true as 1', () => {
      const sql = 'INSERT INTO data (bool_field) VALUES (?)';
      const params = [1];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { bool_field: 1 } });
    });
    
    it('should handle false as 0', () => {
      const sql = 'INSERT INTO data (bool_field) VALUES (?)';
      const params = [0];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { bool_field: 0 } });
    });
    
    it('should handle boolean values', () => {
      const sql = 'INSERT INTO data (bool_field) VALUES (?)';
      const params = [true];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { bool_field: true } });
    });
  });
  
  describe('JSON as Text', () => {
    it('should handle JSON objects as strings', () => {
      const jsonData = { name: 'John', age: 30, active: true };
      const sql = 'INSERT INTO data (json_field) VALUES (?)';
      const params = [JSON.stringify(jsonData)];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.doc.json_field).toEqual(JSON.stringify(jsonData));
    });
    
    it('should handle JSON arrays', () => {
      const jsonArray = [1, 2, 3, 'four', { five: 5 }];
      const sql = 'INSERT INTO data (json_field) VALUES (?)';
      const params = [JSON.stringify(jsonArray)];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.doc.json_field).toEqual(JSON.stringify(jsonArray));
    });
    
    it('should handle nested JSON', () => {
      const nestedJson = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      };
      const sql = 'INSERT INTO data (json_field) VALUES (?)';
      const params = [JSON.stringify(nestedJson)];
      
      const result = sqlToDql(sql, params);
      expect(result.args?.doc.json_field).toEqual(JSON.stringify(nestedJson));
    });
    
    it('should handle JSON with special characters', () => {
      const jsonWithSpecial = {
        quote: 'He said "Hello"',
        newline: 'Line 1\nLine 2',
        unicode: '😀 Unicode emoji'
      };
      const sql = 'INSERT INTO data (json_field) VALUES (?)';
      const params = [JSON.stringify(jsonWithSpecial)];
      
      const result = sqlToDql(sql, params);
      const parsed = JSON.parse(result.args?.doc.json_field);
      expect(parsed.unicode).toContain('😀');
    });
  });
  
  describe('Date/DateTime as Strings', () => {
    it('should handle ISO date strings', () => {
      const isoDate = '2024-01-15T10:30:00.000Z';
      const sql = 'INSERT INTO data (date_field) VALUES (?)';
      const params = [isoDate];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { date_field: isoDate } });
    });
    
    it('should handle date only strings', () => {
      const dateOnly = '2024-01-15';
      const sql = 'INSERT INTO data (date_field) VALUES (?)';
      const params = [dateOnly];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { date_field: dateOnly } });
    });
    
    it('should handle timestamp strings', () => {
      const timestamp = new Date().toISOString();
      const sql = 'INSERT INTO data (date_field) VALUES (?)';
      const params = [timestamp];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { date_field: timestamp } });
    });
    
    it('should handle various date formats', () => {
      const formats = [
        '2024-01-15',
        '2024-01-15T10:30:00',
        '2024-01-15T10:30:00Z',
        '2024-01-15T10:30:00+05:00',
        '2024-01-15 10:30:00'
      ];
      
      formats.forEach(format => {
        const sql = 'INSERT INTO data (date_field) VALUES (?)';
        const params = [format];
        
        const result = sqlToDql(sql, params);
        expect(result.args).toEqual({ doc: { date_field: format } });
      });
    });
  });
  
  describe('NULL Handling', () => {
    it('should handle NULL values', () => {
      const sql = 'INSERT INTO data (nullable_field) VALUES (?)';
      const params = [null];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { nullable_field: null } });
    });
    
    it('should handle mixed NULL and non-NULL values', () => {
      const sql = 'INSERT INTO data (text_field, int_field, nullable_field) VALUES (?, ?, ?)';
      const params = ['text', 42, null];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: {
        text_field: 'text',
        int_field: 42,
        nullable_field: null
      } });
    });
    
    it('should handle undefined as NULL', () => {
      const sql = 'INSERT INTO data (nullable_field) VALUES (?)';
      const params = [undefined];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { nullable_field: undefined } });
    });
  });
  
  describe('Type Conversions', () => {
    it('should preserve string numbers', () => {
      const sql = 'INSERT INTO data (text_field) VALUES (?)';
      const params = ['42'];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { text_field: '42' } });
      expect(typeof result.args?.doc.text_field).toBe('string');
    });
    
    it('should preserve number strings', () => {
      const sql = 'INSERT INTO data (int_field) VALUES (?)';
      const params = [42];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { int_field: 42 } });
      expect(typeof result.args?.doc.int_field).toBe('number');
    });
    
    it('should handle mixed types in same query', () => {
      const sql = 'INSERT INTO data (text_field, int_field, real_field, bool_field) VALUES (?, ?, ?, ?)';
      const params = ['text', 42, 3.14, 1];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: {
        text_field: 'text',
        int_field: 42,
        real_field: 3.14,
        bool_field: 1
      } });
      
      expect(typeof result.args?.doc.text_field).toBe('string');
      expect(typeof result.args?.doc.int_field).toBe('number');
      expect(typeof result.args?.doc.real_field).toBe('number');
      expect(typeof result.args?.doc.bool_field).toBe('number');
    });
  });
  
  describe('Binary/Blob Data', () => {
    it('should handle base64 encoded data', () => {
      const base64Data = 'SGVsbG8gV29ybGQh'; // "Hello World!" in base64
      const sql = 'INSERT INTO data (blob_field) VALUES (?)';
      const params = [base64Data];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { blob_field: base64Data } });
    });
    
    it('should handle binary-like strings', () => {
      const binaryString = '\x00\x01\x02\x03\x04\x05';
      const sql = 'INSERT INTO data (blob_field) VALUES (?)';
      const params = [binaryString];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { blob_field: binaryString } });
    });
    
    it('should handle Buffer data as base64', () => {
      // Simulating Buffer.toString('base64')
      const bufferAsBase64 = Buffer.from('Hello Buffer').toString('base64');
      const sql = 'INSERT INTO data (blob_field) VALUES (?)';
      const params = [bufferAsBase64];
      
      const result = sqlToDql(sql, params);
      expect(result.args).toEqual({ doc: { blob_field: bufferAsBase64 } });
    });
  });
  
  describe('Integration with Drizzle Types', () => {
    let mockDitto: any;
    let db: any;
    
    beforeEach(() => {
      const store = new DataTypeMockStore();
      mockDitto = { 
        disableSyncWithV3: jest.fn(),
        store 
      };
      db = wrapDittoWithDrizzle(mockDitto, { schema });
    });
    
    it('should handle all data types in single insert', async () => {
      const now = new Date().toISOString();
      
      await db.insert(dataTypes).values({
        id: 'test-1',
        text_field: 'Sample text',
        int_field: 42,
        real_field: 3.14159,
        blob_field: 'QmluYXJ5RGF0YQ==',
        bool_field: 1,
        json_field: JSON.stringify({ key: 'value' }),
        date_field: now,
        nullable_field: null
      });
      
      // Query should work
      const query = db.select().from(dataTypes);
      expect(query).toBeDefined();
    });
  });
});