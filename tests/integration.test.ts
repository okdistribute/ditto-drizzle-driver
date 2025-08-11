import { Ditto, DittoConfig } from '@dittolive/ditto';
import { wrapDittoWithDrizzle } from '../src';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { eq, and, gt, like, sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Define test schema
const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  age: integer('age'),
  created_at: text('created_at').notNull()
});

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  published: integer('published').notNull().default(0),
  views: integer('views').default(0),
  created_at: text('created_at').notNull()
});

const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: real('price').notNull(),
  stock: integer('stock').notNull(),
  category: text('category')
});

// Define relations
const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}));

const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.user_id],
    references: [users.id]
  })
}));

const schema = {
  users,
  posts,
  products,
  usersRelations,
  postsRelations
};

// Helper to create unique test database path
function createTestDbPath(testName: string): string {
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const dbName = `ditto-drizzle-test-${testName}-${timestamp}-${random}`;
  return path.join(tmpDir, dbName);
}

// Helper to clean up test database
function cleanupTestDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`Failed to cleanup test db at ${dbPath}:`, error);
  }
}

describe('Real Ditto Integration Tests', () => {
  let ditto: Ditto;
  let db: any;
  let testDbPath: string;

  // Test schema with unique constraints for warning test
  const schemaWithUniqueConstraints = {
    testTable: sqliteTable('test_unique', {
      id: text('id').primaryKey(),
      email: text('email').unique(),
      username: text('username').unique()
    })
  };

  beforeEach(async () => {
    // Create a unique test database path
    testDbPath = createTestDbPath('integration');
    
    // Create real Ditto instance with DittoConfig
    // Using smallPeersOnly for offline testing
    const config = new DittoConfig('test-app-id', {
      mode: 'smallPeersOnly'
    } as any, testDbPath);
    ditto = await Ditto.open(config);

    await ditto.disableSyncWithV3();
    
    // Wrap with Drizzle
    db = wrapDittoWithDrizzle(ditto, { 
      schema,
      logger: false // Set to true for debugging
    });
  });

  afterEach(async () => {
    // Clean up
    if (ditto) {
      await ditto.close();
    }
    cleanupTestDb(testDbPath);
  });

  describe('Basic CRUD Operations', () => {
    it('should insert and select data', async () => {
      const userId = 'user-test-1';
      const now = new Date().toISOString();
      
      // Insert user
      await db.insert(users).values({
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        created_at: now
      });
      
      // Select all users
      const allUsers = await db.select().from(users);
      
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0]).toMatchObject({
        id: userId,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });
    });

    it('should update data', async () => {
      const userId = 'user-test-2';
      const now = new Date().toISOString();
      
      // Insert user
      await db.insert(users).values({
        id: userId,
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25,
        created_at: now
      });
      
      // Update user
      await db.update(users)
        .set({ age: 26, email: 'jane.smith@example.com' })
        .where(eq(users.id, userId));
      
      // Verify update
      const updatedUsers = await db.select().from(users).where(eq(users.id, userId));
      
      expect(updatedUsers[0].age).toBe(26);
      expect(updatedUsers[0].email).toBe('jane.smith@example.com');
    });

    it('should delete data', async () => {
      const userId = 'user-test-3';
      const now = new Date().toISOString();
      
      // Insert user
      await db.insert(users).values({
        id: userId,
        name: 'Delete Me',
        email: 'delete@example.com',
        age: 40,
        created_at: now
      });
      
      // Verify insertion
      const beforeDelete = await db.select().from(users).where(eq(users.id, userId));
      expect(beforeDelete).toHaveLength(1);
      
      // Delete user
      await db.delete(users).where(eq(users.id, userId));
      
      // Verify deletion
      const afterDelete = await db.select().from(users).where(eq(users.id, userId));
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe('Complex Queries', () => {
    beforeEach(async () => {
      const now = new Date().toISOString();
      
      // Insert test data
      await db.insert(users).values([
        { id: 'u1', name: 'Alice', email: 'alice@test.com', age: 25, created_at: now },
        { id: 'u2', name: 'Bob', email: 'bob@test.com', age: 30, created_at: now },
        { id: 'u3', name: 'Charlie', email: 'charlie@test.com', age: 35, created_at: now },
        { id: 'u4', name: 'Alice Cooper', email: 'alice.cooper@test.com', age: 40, created_at: now }
      ]);
    });

    it('should filter with WHERE conditions', async () => {
      // Find users older than 30
      const olderUsers = await db.select()
        .from(users)
        .where(gt(users.age, 30));
      
      expect(olderUsers).toHaveLength(2);
      expect(olderUsers.map((u: any) => u.name).sort()).toEqual(['Alice Cooper', 'Charlie']);
    });

    it('should handle multiple WHERE conditions', async () => {
      // Find users named Alice who are older than 30
      const results = await db.select()
        .from(users)
        .where(
          and(
            like(users.name, '%Alice%'),
            gt(users.age, 30)
          )
        );
      
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice Cooper');
    });

    it('should handle LIKE patterns', async () => {
      // Find users with 'alice' in email
      const results = await db.select()
        .from(users)
        .where(like(users.email, '%alice%'));
      
      expect(results).toHaveLength(2);
      const emails = results.map((u: any) => u.email).sort();
      expect(emails).toEqual(['alice.cooper@test.com', 'alice@test.com']);
    });
  });

  describe('Transactions', () => {
    it('should commit successful transactions', async () => {
      const now = new Date().toISOString();
      
      await db.transaction(async (tx: any) => {
        // Insert user
        await tx.insert(users).values({
          id: 'tx-user-1',
          name: 'Transaction User',
          email: 'tx@example.com',
          age: 28,
          created_at: now
        });
        
        // Insert post for that user
        await tx.insert(posts).values({
          id: 'tx-post-1',
          user_id: 'tx-user-1',
          title: 'Transaction Post',
          content: 'Created in transaction',
          published: 1,
          views: 0,
          created_at: now
        });
      });
      
      // Verify both were committed
      const txUsers = await db.select().from(users).where(eq(users.id, 'tx-user-1'));
      const txPosts = await db.select().from(posts).where(eq(posts.id, 'tx-post-1'));
      
      expect(txUsers).toHaveLength(1);
      expect(txPosts).toHaveLength(1);
    });

    it('should rollback failed transactions', async () => {
      const now = new Date().toISOString();
      
      try {
        await db.transaction(async (tx: any) => {
          // Insert user
          await tx.insert(users).values({
            id: 'rollback-user',
            name: 'Should Rollback',
            email: 'rollback@example.com',
            age: 50,
            created_at: now
          });
          
          // Intentionally throw error
          throw new Error('Rollback test');
        });
        
        fail('Transaction should have thrown');
      } catch (error: any) {
        expect(error.message).toBe('Rollback test');
      }
      
      // Verify user was not created
      const rollbackUsers = await db.select().from(users).where(eq(users.id, 'rollback-user'));
      expect(rollbackUsers).toHaveLength(0);
    });

    it('should handle read-only transactions', async () => {
      const now = new Date().toISOString();
      
      // Insert initial data
      await db.insert(users).values({
        id: 'readonly-test',
        name: 'Read Only',
        email: 'readonly@example.com',
        age: 45,
        created_at: now
      });
      
      // Read-only transaction
      const result = await db.transaction(async (tx: any) => {
        const usersResult = await tx.select().from(users).where(eq(users.id, 'readonly-test'));
        return usersResult[0];
      }, { isReadOnly: true });
      
      expect(result).toBeDefined();
      expect(result.name).toBe('Read Only');
    });
  });

  describe('Data Types', () => {
    it('should handle all supported data types', async () => {
      const now = new Date().toISOString();
      
      // Test various data types
      await db.insert(products).values({
        id: 'prod-1',
        name: 'Test Product',
        price: 99.99,
        stock: 100,
        category: 'Electronics'
      });
      
      await db.insert(posts).values({
        id: 'post-types',
        user_id: 'test',
        title: 'Data Types Test',
        content: 'Testing various data types:\n\tTabs\n\u{1F600} Emoji',
        published: 1, // Boolean as integer
        views: 0,
        created_at: now
      });
      
      // Verify data types
      const product = (await db.select().from(products).where(eq(products.id, 'prod-1')))[0];
      expect(product.price).toBe(99.99);
      expect(typeof product.price).toBe('number');
      expect(product.stock).toBe(100);
      expect(typeof product.stock).toBe('number');
      
      const post = (await db.select().from(posts).where(eq(posts.id, 'post-types')))[0];
      expect(post.content).toContain('😀');
      expect(post.published).toBe(1);
    });

    it('should handle NULL values', async () => {
      const now = new Date().toISOString();
      
      // Insert with NULL values
      await db.insert(users).values({
        id: 'null-test',
        name: 'Null Test',
        email: 'null@test.com',
        age: null,
        created_at: now
      });
      
      await db.insert(products).values({
        id: 'prod-null',
        name: 'No Category',
        price: 10.00,
        stock: 5,
        category: null
      });
      
      // Verify NULL values
      const user = (await db.select().from(users).where(eq(users.id, 'null-test')))[0];
      expect(user.age).toBeNull();
      
      const product = (await db.select().from(products).where(eq(products.id, 'prod-null')))[0];
      expect(product.category).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch inserts', async () => {
      const now = new Date().toISOString();
      
      // Batch insert users
      const userBatch = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-${i}`,
        name: `User ${i}`,
        email: `user${i}@batch.com`,
        age: 20 + i,
        created_at: now
      }));
      
      // Drizzle will handle this as multiple inserts
      for (const user of userBatch) {
        await db.insert(users).values(user);
      }
      
      // Verify all were inserted
      const batchUsers = await db.select().from(users).where(like(users.id, 'batch-%'));
      expect(batchUsers).toHaveLength(10);
    });

    it('should handle batch updates', async () => {
      // Insert test products
      const productBatch = Array.from({ length: 5 }, (_, i) => ({
        id: `update-prod-${i}`,
        name: `Product ${i}`,
        price: 10.00 * (i + 1),
        stock: 100,
        category: 'Test'
      }));
      
      for (const product of productBatch) {
        await db.insert(products).values(product);
      }
      
      // Update all products in Test category
      await db.update(products)
        .set({ stock: 50 })
        .where(eq(products.category, 'Test'));
      
      // Verify updates
      const updatedProducts = await db.select()
        .from(products)
        .where(like(products.id, 'update-prod-%'));
      
      expect(updatedProducts).toHaveLength(5);
      updatedProducts.forEach((p: any) => {
        expect(p.stock).toBe(50);
      });
    });
  });

  describe('Aggregates and Projections', () => {
    beforeEach(async () => {
      // Insert test data for aggregates
      const testProducts = [
        { id: 'agg-1', name: 'Laptop', price: 1000, stock: 2, category: 'Electronics' },
        { id: 'agg-2', name: 'Mouse', price: 25, stock: 5, category: 'Electronics' },
        { id: 'agg-3', name: 'Desk', price: 500, stock: 1, category: 'Furniture' },
        { id: 'agg-4', name: 'Chair', price: 150, stock: 4, category: 'Furniture' },
        { id: 'agg-5', name: 'Monitor', price: 300, stock: 2, category: 'Electronics' },
      ];
      
      for (const product of testProducts) {
        await db.insert(products).values(product);
      }
    });
    
    it('should handle COUNT aggregate', async () => {
      const result = await db.select({ count: sql`COUNT(*)` })
        .from(products)
        .where(like(products.id, 'agg-%'));
      
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(5);
    });
    
    it('should handle SUM aggregate', async () => {
      const result = await db.select({ 
        total: sql<number>`SUM(${products.stock})` 
      })
      .from(products)
      .where(like(products.id, 'agg-%'));
      
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(14); // 2+5+1+4+2
    });
    
    it('should handle AVG aggregate', async () => {
      const result = await db.select({ 
        average: sql<number>`AVG(${products.price})` 
      })
      .from(products)
      .where(like(products.id, 'agg-%'));
      
      expect(result).toHaveLength(1);
      expect(result[0].average).toBeCloseTo(395, 0); // (1000+25+500+150+300)/5
    });
    
    it('should handle MIN and MAX aggregates', async () => {
      const result = await db.select({ 
        min: sql<number>`MIN(${products.price})`,
        max: sql<number>`MAX(${products.price})`
      })
      .from(products)
      .where(like(products.id, 'agg-%'));
      
      expect(result).toHaveLength(1);
      expect(result[0].min).toBe(25);
      expect(result[0].max).toBe(1000);
    });
    
    it('should handle GROUP BY with aggregates', async () => {
      const result = await db.select({
        category: products.category,
        count: sql<number>`COUNT(*)`,
        total_stock: sql<number>`SUM(${products.stock})`
      })
      .from(products)
      .where(like(products.id, 'agg-%'))
      .groupBy(products.category)
      .orderBy(products.category);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ 
        category: 'Electronics', 
        count: 3,
        total_stock: 9 // 2+5+2
      });
      expect(result[1]).toMatchObject({ 
        category: 'Furniture', 
        count: 2,
        total_stock: 5 // 1+4
      });
    });
    
    it('should handle DISTINCT selection', async () => {
      const result = await db.selectDistinct({
        category: products.category
      })
      .from(products)
      .where(like(products.id, 'agg-%'))
      .orderBy(products.category);
      
      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('Electronics');
      expect(result[1].category).toBe('Furniture');
    });
    
    it('should handle column projections', async () => {
      const result = await db.select({
        name: products.name,
        price: products.price
      })
      .from(products)
      .where(eq(products.id, 'agg-1'));
      
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('price');
      expect(result[0]).not.toHaveProperty('category');
      expect(result[0]).not.toHaveProperty('stock');
    });
  });

  describe('Error Handling', () => {
    it('should handle constraint violations gracefully', async () => {
      const now = new Date().toISOString();
      
      // Insert user
      await db.insert(users).values({
        id: 'duplicate-test',
        name: 'Original',
        email: 'original@test.com',
        age: 30,
        created_at: now
      });
      
      // Try to insert duplicate ID (should fail)
      try {
        await db.insert(users).values({
          id: 'duplicate-test',
          name: 'Duplicate',
          email: 'duplicate@test.com',
          age: 25,
          created_at: now
        });
        fail('Should have thrown duplicate key error');
      } catch (error: any) {
        // Error is expected - Ditto enforces uniqueness on _id
        expect(error).toBeDefined();
        expect(error.message).toContain('Identifier conflict');
      }
      
      // Verify original is unchanged
      const user = (await db.select().from(users).where(eq(users.id, 'duplicate-test')))[0];
      expect(user.name).toBe('Original');
    });

    it('should handle invalid queries', async () => {
      // Try to query non-existent table
      // This would fail at TypeScript level normally, but testing runtime behavior
      try {
        await db.execute('SELECT * FROM non_existent_table');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Schema Validation Errors', () => {
    it('should throw error for unique constraints in schema', async () => {
      // Create a new Ditto instance for this test
      const warnTestPath = createTestDbPath('warning-test');
      const warnConfig = new DittoConfig('test-app-id', {
        mode: 'smallPeersOnly'
      } as any, warnTestPath);
      const warnDitto = await Ditto.open(warnConfig);
      await warnDitto.disableSyncWithV3();

      try {
        // This should now throw an error
        expect(() => {
          wrapDittoWithDrizzle(warnDitto, {
            schema: schemaWithUniqueConstraints,
            logger: false
          });
        }).toThrow('UNIQUE constraints');
      } finally {
        await warnDitto.close();
        cleanupTestDb(warnTestPath);
      }
    });
  });

  // Uncomment these tests when the feature is stable
  describe('Observe Functionality', () => {
    it('should observe query changes', (done) => {
      const now = new Date().toISOString();
      const observedData: any[] = [];
      
      // Start observing users table
      const query = db.select().from(users).where(like(users.id, 'observe-%'));
      const observer = db.observe(
        query,
        (data: any[], metadata: any) => {
          observedData.push({ data: [...data], metadata });
          
          // After receiving updates
          if (observedData.length >= 2) {
            // Find the update with data
            const updateWithData = observedData.find(d => d.data.length > 0);
            
            if (updateWithData) {
              // Verify we got the inserted data
              expect(updateWithData.data).toHaveLength(1);
              expect(updateWithData.data[0].name).toBe('Observable User');
              expect(updateWithData.metadata?.hasChanges).toBe(true);
              
              observer.cancel();
              done();
            }
          }
        }
      );
      
      // Wait a bit for initial emission then insert data
      setTimeout(async () => {
        // Insert data that should trigger the observer
        await db.insert(users).values({
          id: 'observe-1',
          name: 'Observable User',
          email: 'observe@test.com',
          age: 25,
          created_at: now
        });
      }, 100);
    });
    
    it('should support multiple observers', async () => {
      const now = new Date().toISOString();
      const observer1Data: any[] = [];
      const observer2Data: any[] = [];
      
      // Create two observers with different queries
      const observer1 = db.observe(
        db.select().from(users).where(eq(users.age, 30)),
        (data: any[]) => {
          observer1Data.push([...data]);
        },
        { emitInitialValue: false }
      );
      
      const observer2 = db.observe(
        db.select().from(users).where(eq(users.age, 40)),
        (data: any[]) => {
          observer2Data.push([...data]);
        },
        { emitInitialValue: false }
      );
      
      // Insert data for observer1
      await db.insert(users).values({
        id: 'multi-observe-1',
        name: 'User 30',
        email: 'user30@test.com',
        age: 30,
        created_at: now
      });
      
      // Insert data for observer2
      await db.insert(users).values({
        id: 'multi-observe-2',
        name: 'User 40',
        email: 'user40@test.com',
        age: 40,
        created_at: now
      });
      
      // Wait for observers to process
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify each observer only received relevant data
      expect(observer1Data.length).toBeGreaterThan(0);
      expect(observer1Data[observer1Data.length - 1]).toHaveLength(1);
      expect(observer1Data[observer1Data.length - 1][0].age).toBe(30);
      
      expect(observer2Data.length).toBeGreaterThan(0);
      expect(observer2Data[observer2Data.length - 1]).toHaveLength(1);
      expect(observer2Data[observer2Data.length - 1][0].age).toBe(40);
      
      // Cleanup
      observer1.cancel();
      observer2.cancel();
    });
    
    it('should handle observer cancellation', async () => {
      const now = new Date().toISOString();
      let callCount = 0;
      
      const observer = db.observe(
        db.select().from(users).where(like(users.id, 'cancel-%')),
        () => {
          callCount++;
        }
      );
      
      // Should be active initially
      expect(observer.isActive).toBe(true);
      
      // Cancel the observer
      observer.cancel();
      expect(observer.isActive).toBe(false);
      
      // Insert data - should not trigger callback
      await db.insert(users).values({
        id: 'cancel-1',
        name: 'Should Not Trigger',
        email: 'cancel@test.com',
        age: 50,
        created_at: now
      });
      
      // Wait to ensure no callback
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should only have initial callback if emitInitialValue was true
      expect(callCount).toBeLessThanOrEqual(1);
    });
    
    it('should support debouncing', (done) => {
      const now = new Date().toISOString();
      const observedData: any[] = [];
      let insertsDone = false;
      
      const observer = db.observe(
        db.select().from(users).where(like(users.id, 'debounce-%')),
        (data: any[]) => {
          observedData.push({ 
            count: data.length, 
            timestamp: Date.now() 
          });
          
          // Check after inserts are done and we have data
          if (insertsDone && data.length === 3) {
            // Verify we got all 3 items
            expect(data.length).toBe(3);
            
            // With debouncing, we should have fewer emissions than without
            // (initial + debounced updates)
            expect(observedData.length).toBeLessThanOrEqual(4);
            
            observer.cancel();
            done();
          }
        },
        { debounce: 150 }
      );
      
      // Wait for initial emission then insert rapidly
      setTimeout(async () => {
        // Insert multiple items rapidly
        for (let i = 1; i <= 3; i++) {
          await db.insert(users).values({
            id: `debounce-${i}`,
            name: `Debounce User ${i}`,
            email: `debounce${i}@test.com`,
            age: 20 + i,
            created_at: now
          });
          // Small delay between inserts
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        insertsDone = true;
      }, 50);
    }, 10000);
    
    it('should skip initial value when configured', async () => {
      const observedData: any[] = [];
      
      const observer = db.observe(
        db.select().from(users).where(like(users.id, 'skip-initial-%')),
        (data: any[]) => {
          observedData.push(data.length);
        },
        { emitInitialValue: false }
      );
      
      // Wait to ensure no initial emission
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have no emissions yet
      expect(observedData).toHaveLength(0);
      
      // Insert data
      await db.insert(users).values({
        id: 'skip-initial-1',
        name: 'Test User',
        email: 'skip@test.com',
        age: 35,
        created_at: new Date().toISOString()
      });
      
      // Wait for observer to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have exactly one emission (no initial)
      expect(observedData).toHaveLength(1);
      expect(observedData[0]).toBe(1);
      
      observer.cancel();
    });
  });
});