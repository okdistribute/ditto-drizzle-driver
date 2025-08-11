import { Ditto, DittoConfig } from '@dittolive/ditto';
import { wrapDittoWithDrizzle } from '../src';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq, like } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DittoUnsupportedConstraintError } from '../src/errors/DittoDriverErrors';

// Define test schema with various constraints
const testTable = sqliteTable('test_table', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  username: text('username').notNull().unique(),
  age: integer('age')
});

// Define tables with foreign key references
const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique()
});

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  user_id: text('user_id').notNull().references(() => users.id),
  category_id: text('category_id').references(() => categories.id, { onDelete: 'cascade' })
});

const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull()
});

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

describe('Unique Constraints and Primary Keys', () => {
  let ditto: Ditto;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = createTestDbPath('unique-constraints');
    const config = new DittoConfig('test-app-id', {
      mode: 'smallPeersOnly'
    } as any, testDbPath);
    ditto = await Ditto.open(config);
    await ditto.disableSyncWithV3();
  });

  afterEach(async () => {
    if (ditto) {
      await ditto.close();
    }
    cleanupTestDb(testDbPath);
  });

  describe('Schema Validation', () => {
    it('should throw error when schema contains unique constraints', () => {
      // Should throw when trying to create db with unique constraints
      expect(() => {
        wrapDittoWithDrizzle(ditto, {
          schema: { testTable },
          logger: false
        });
      }).toThrow(DittoUnsupportedConstraintError);
    });

    it('should throw error when schema contains foreign key references', () => {
      // Should throw when trying to create db with foreign keys
      expect(() => {
        wrapDittoWithDrizzle(ditto, {
          schema: { users, posts, categories },
          logger: false
        });
      }).toThrow(DittoUnsupportedConstraintError);
    });

    it('should allow schema with only id primary key', () => {
      // Schema with only primary key should work
      const simpleTable = sqliteTable('simple', {
        id: text('id').primaryKey(),
        name: text('name'),
        value: integer('value')
      });

      // Should not throw
      const simpleDb = wrapDittoWithDrizzle(ditto, {
        schema: { simpleTable },
        logger: false
      });

      expect(simpleDb).toBeDefined();
    });
  });

  describe('Primary Key Behavior (with simple schema)', () => {
    let simpleDb: any;
    const simpleTable = sqliteTable('simple', {
      id: text('id').primaryKey(),
      name: text('name'),
      value: integer('value')
    });

    beforeEach(() => {
      simpleDb = wrapDittoWithDrizzle(ditto, {
        schema: { simpleTable },
        logger: false
      });
    });

    it('should enforce uniqueness on primary key field (id/_id)', async () => {
      // Insert first record
      await simpleDb.insert(simpleTable).values({
        id: 'pk-test-1',
        name: 'First Record',
        value: 100
      });

      // Try to insert duplicate primary key - should fail
      await expect(
        simpleDb.insert(simpleTable).values({
          id: 'pk-test-1',
          name: 'Second Record',
          value: 200
        })
      ).rejects.toThrow('Identifier conflict');

      // Verify only first record exists
      const records = await simpleDb.select().from(simpleTable).where(eq(simpleTable.id, 'pk-test-1'));
      expect(records).toHaveLength(1);
      expect(records[0].name).toBe('First Record');
    });

    it('should allow different primary keys', async () => {
      // Insert multiple records with different IDs
      await simpleDb.insert(simpleTable).values([
        { id: 'pk-1', name: 'Record 1', value: 10 },
        { id: 'pk-2', name: 'Record 2', value: 20 },
        { id: 'pk-3', name: 'Record 3', value: 30 }
      ]);

      const records = await simpleDb.select().from(simpleTable);
      expect(records).toHaveLength(3);
    });
  });

  describe('Duplicate Data Behavior (without constraints)', () => {
    let simpleDb: any;
    const duplicatesTable = sqliteTable('duplicates', {
      id: text('id').primaryKey(),
      email: text('email'),  // No unique constraint
      username: text('username')  // No unique constraint
    });

    beforeEach(() => {
      simpleDb = wrapDittoWithDrizzle(ditto, {
        schema: { duplicatesTable },
        logger: false
      });
    });

    it('should allow duplicate values in non-primary-key fields', async () => {
      // Insert first record
      await simpleDb.insert(duplicatesTable).values({
        id: 'dup-test-1',
        email: 'same@test.com',
        username: 'sameuser'
      });

      // Insert second record with same email and username
      // This succeeds because Ditto doesn't enforce unique constraints
      await simpleDb.insert(duplicatesTable).values({
        id: 'dup-test-2',
        email: 'same@test.com',  // Same email
        username: 'sameuser'     // Same username
      });

      // Both records should exist
      const records = await simpleDb.select().from(duplicatesTable);
      expect(records).toHaveLength(2);
      
      // Both should have the same email
      const sameEmails = records.filter((r: any) => r.email === 'same@test.com');
      expect(sameEmails).toHaveLength(2);
    });

    it('should allow NULL values in fields', async () => {
      // Insert records with NULL values
      await simpleDb.insert(duplicatesTable).values([
        { id: 'null-1', email: null, username: 'user1' },
        { id: 'null-2', email: null, username: 'user2' }
      ]);

      const records = await simpleDb.select().from(duplicatesTable);
      expect(records).toHaveLength(2);
      expect(records.every((r: any) => r.email === null)).toBe(true);
    });
  });

  describe('Relational Data Behavior (without foreign keys)', () => {
    let relationalDb: any;
    
    // Define tables without foreign key constraints
    const simpleUsers = sqliteTable('users', {
      id: text('id').primaryKey(),
      name: text('name'),
      email: text('email')
    });
    
    const simplePosts = sqliteTable('posts', {
      id: text('id').primaryKey(),
      title: text('title'),
      content: text('content'),
      user_id: text('user_id'),  // No foreign key reference
      category_id: text('category_id')  // No foreign key reference
    });
    
    const simpleCategories = sqliteTable('categories', {
      id: text('id').primaryKey(),
      name: text('name')
    });

    beforeEach(async () => {
      relationalDb = wrapDittoWithDrizzle(ditto, {
        schema: { simpleUsers, simplePosts, simpleCategories },
        logger: false
      });
    });

    it('should allow references to non-existent records', async () => {
      // Insert a post with a non-existent user ID
      // This succeeds because Ditto doesn't enforce referential integrity
      await relationalDb.insert(simplePosts).values({
        id: 'post-1',
        title: 'Test Post',
        content: 'Content',
        user_id: 'non-existent-user',  // This user doesn't exist!
        category_id: null
      });

      // The post should be created despite invalid reference
      const result = await relationalDb.select().from(simplePosts).where(eq(simplePosts.id, 'post-1'));
      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe('non-existent-user');
    });

    it('should allow orphaned records', async () => {
      // Create a user and a post
      await relationalDb.insert(simpleUsers).values({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com'
      });

      await relationalDb.insert(simplePosts).values({
        id: 'post-2',
        title: 'User Post',
        content: 'Posted by user-1',
        user_id: 'user-1',
        category_id: null
      });

      // Delete the user - in SQL this would fail or cascade
      await relationalDb.delete(simpleUsers).where(eq(simpleUsers.id, 'user-1'));

      // The post should still exist (orphaned)
      const orphanedPost = await relationalDb.select().from(simplePosts).where(eq(simplePosts.id, 'post-2'));
      expect(orphanedPost).toHaveLength(1);
      expect(orphanedPost[0].user_id).toBe('user-1'); // Points to non-existent user

      // Verify user is really gone
      const deletedUser = await relationalDb.select().from(simpleUsers).where(eq(simpleUsers.id, 'user-1'));
      expect(deletedUser).toHaveLength(0);
    });

    it('should not cascade deletes', async () => {
      // Create a category and posts
      await relationalDb.insert(simpleCategories).values({
        id: 'cat-1',
        name: 'Technology'
      });

      await relationalDb.insert(simplePosts).values([
        {
          id: 'post-3',
          title: 'Tech Post 1',
          content: 'About tech',
          user_id: 'some-user',
          category_id: 'cat-1'
        },
        {
          id: 'post-4',
          title: 'Tech Post 2',
          content: 'More tech',
          user_id: 'some-user',
          category_id: 'cat-1'
        }
      ]);

      // Delete the category
      await relationalDb.delete(simpleCategories).where(eq(simpleCategories.id, 'cat-1'));

      // Posts should still exist
      const postsInCategory = await relationalDb.select().from(simplePosts)
        .where(eq(simplePosts.category_id, 'cat-1'));
      
      expect(postsInCategory).toHaveLength(2); // Posts NOT deleted
      expect(postsInCategory[0].category_id).toBe('cat-1'); // Still references deleted category
    });

    it('should allow circular references', async () => {
      // Create posts that reference each other
      await relationalDb.insert(simplePosts).values({
        id: 'circular-1',
        title: 'First Post',
        content: 'References second',
        user_id: 'circular-2',
        category_id: null
      });

      await relationalDb.insert(simplePosts).values({
        id: 'circular-2',
        title: 'Second Post',
        content: 'References first',
        user_id: 'circular-1',  // Circular reference!
        category_id: null
      });

      // Both should exist with circular references
      const allPosts = await relationalDb.select().from(simplePosts)
        .where(like(simplePosts.id, 'circular-%'));
      
      expect(allPosts).toHaveLength(2);
      
      const post1 = allPosts.find((p: any) => p.id === 'circular-1');
      const post2 = allPosts.find((p: any) => p.id === 'circular-2');
      
      expect(post1?.user_id).toBe('circular-2');
      expect(post2?.user_id).toBe('circular-1');
    });
  });

  describe('Schema Constraints Documentation', () => {
    it('should document that only id field uniqueness is enforced', () => {
      // This is a documentation test to make it clear what is and isn't enforced
      const constraints = {
        primaryKey: 'ENFORCED - Ditto enforces uniqueness on _id field',
        unique: 'NOT ENFORCED - Other unique constraints are ignored',
        notNull: 'NOT ENFORCED at database level - handled by Drizzle at runtime',
        foreignKey: 'NOT SUPPORTED - No foreign key constraints in Ditto',
        check: 'NOT SUPPORTED - No check constraints in Ditto',
        default: 'HANDLED by Drizzle at insertion time',
        references: 'NOT ENFORCED - No referential integrity',
        cascade: 'NOT SUPPORTED - No cascade operations'
      };

      // This test serves as documentation
      expect(constraints.primaryKey).toContain('ENFORCED');
      expect(constraints.unique).toContain('NOT ENFORCED');
      expect(constraints.foreignKey).toContain('NOT SUPPORTED');
      expect(constraints.references).toContain('NOT ENFORCED');
      expect(constraints.cascade).toContain('NOT SUPPORTED');
    });
  });
});