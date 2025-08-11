# Ditto Drizzle Driver

A Drizzle ORM driver for Ditto SDK, allowing you to use Drizzle's familiar SQL-like syntax with Ditto's distributed database.

## Installation

NOTE: this is not published on NPM yet.

```bash
npm install @dittolive/drizzle-driver @dittolive/ditto drizzle-orm
```

## Quick Start

```typescript
import { Ditto } from '@dittolive/ditto';
import { wrapDittoWithDrizzle } from '@dittolive/drizzle-driver';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Define your schema
const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email')
});

// Initialize Ditto
const ditto = await Ditto.open(yourDittoConfig);

// Wrap with Drizzle
const db = wrapDittoWithDrizzle(ditto, {
  schema: { users }
});

// Use Drizzle syntax
await db.insert(users).values({
  id: '123',
  name: 'John Doe',
  email: 'john@example.com'
});

const allUsers = await db.select().from(users);
```

## Features

### ✅ Supported Operations

- **Basic CRUD Operations**
  - SELECT queries with WHERE, ORDER BY, LIMIT
  - INSERT single or multiple records
  - UPDATE with conditions
  - DELETE with conditions
  
- **Indexing** (SDK 4.12.0+)
  - CREATE INDEX for improved query performance
  - Single-field indexes
  - Nested field indexes with dot notation
  - IF NOT EXISTS clause support
  
- **Transactions**
  - Read-only and read-write transactions
  - Automatic rollback on errors
  
- **Schema Definition**
  - SQLite table definitions
  - Relations (basic support)
  
- **Type Safety**
  - Full TypeScript support
  - Inferred types from schema

### ⚠️ Limitations

Due to differences between SQL and DQL (Ditto Query Language):

- **No JOIN support** - DQL handles relationships differently
- **Limited aggregation functions** - DQL has different aggregation capabilities
- **No subqueries** - Not supported in DQL

## API Reference

### `wrapDittoWithDrizzle(ditto, config?)`

Wraps a Ditto instance with Drizzle ORM capabilities.

**Parameters:**
- `ditto`: An initialized Ditto instance
- `config`: Optional Drizzle configuration
  - `schema`: Your table schema and relations
  - `logger`: Enable query logging (boolean or custom logger)

**Returns:** A Drizzle database instance configured for Ditto

### Schema Definition & Constraints

Use Drizzle's SQLite schema builders:

> 🚨 **Important: Unsupported Features Will Throw Exceptions**
> 
> The driver will throw exceptions when it detects unsupported SQL features to ensure enterprise customers have clear expectations about Ditto's capabilities:
> 
> **Features that will throw exceptions:**
> - **Unique Constraints**: Except on the `id` field (mapped to `_id`)
> - **Foreign Key References**: Including cascade operations
> - **Check Constraints**: Not supported by Ditto
> - **Composite Indexes**: Use single-field indexes instead
> - **Partial Indexes**: No WHERE clause support in indexes
> - **Unique Indexes**: Only simple indexes supported
> - **DROP INDEX**: Indexes cannot be dropped once created
> - **CREATE/ALTER/DROP TABLE**: Ditto is schemaless
> - **JOIN Operations**: Use separate queries instead
> - **Subqueries**: Not supported in DQL
> - **UNION Operations**: Execute separate queries
> 
> **Supported features:**
> - **Primary Keys**: Only the `id` field (enforced as unique)
> - **NOT NULL**: Validated at runtime by Drizzle
> - **Default Values**: Handled by Drizzle during insertion
> - **Basic CRUD**: SELECT, INSERT, UPDATE, DELETE
> - **Simple Indexes**: CREATE INDEX for single fields (SDK 4.12.0+)

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ✅ GOOD: Simple schema without constraints
const users = sqliteTable('users', {
  id: text('id').primaryKey(),  // Primary key is enforced
  name: text('name').notNull(),  // Runtime validation only
  email: text('email'),          // No unique constraint
  age: integer('age')
});

// ❌ BAD: Will throw DittoUnsupportedConstraintError
const badTable = sqliteTable('bad_table', {
  id: text('id').primaryKey(),
  email: text('email').unique(),  // THROWS: Unique constraint not supported
  user_id: text('user_id').references(() => users.id)  // THROWS: Foreign keys not supported
});
```

### Transactions

```typescript
await db.transaction(async (tx) => {
  await tx.insert(users).values({ id: '1', name: 'Alice' });
  await tx.insert(posts).values({
    id: 'post-1',
    title: 'Hello World',
    authorId: '1',
    createdAt: new Date().toISOString()
  });
});
```

## SQL to DQL Translation

The driver automatically translates Drizzle's SQL output to DQL:

| SQL | DQL |
|-----|-----|
| `SELECT * FROM users WHERE age > ?` | `SELECT * FROM users WHERE age > :arg1` |
| `INSERT INTO users (name) VALUES (?)` | `INSERT INTO users DOCUMENTS { name: :arg1 }` |
| `UPDATE users SET name = ? WHERE id = ?` | `UPDATE users SET name = :arg1 WHERE id = :arg2` |
| `DELETE FROM users WHERE id = ?` | `DELETE FROM users WHERE id = :arg1` |

## Development

### Building

```bash
npm run build
```

### Indexing

Create indexes to improve query performance on large datasets (requires SDK 4.12.0+):

```typescript
// Create an index using the helper method
await db.createIndex('users', 'email');
await db.createIndex('users', 'age', 'custom_age_index');

// Or use raw DQL execution
await db.execute('CREATE INDEX IF NOT EXISTS email_idx ON users (email)');

// Index nested fields
await db.execute('CREATE INDEX location_idx ON users (address.city)');
```

**Index Limitations:**
- No composite indexes (use separate indexes for each field)
- No unique indexes (uniqueness only enforced on `_id`)
- No partial indexes (WHERE clauses not supported)

### Real-time Data Observation

The driver includes an `observe()` method that allows you to watch queries for real-time updates.

```typescript
// Observe active users
const observer = db.observe(
  db.select().from(users).where(eq(users.active, true)),
  (users, metadata) => {
    console.log('Active users updated:', users);
    console.log('Has changes:', metadata?.hasChanges);
  }
);

// Stop observing when no longer needed
observer.cancel();

// Check if observer is still active
if (observer.isActive) {
  console.log('Observer is still running');
}
```

### Testing

```bash
npm test
```

## Ditto-Specific Behavior

### Document IDs
- Ditto uses `_id` as the document identifier
- The driver automatically maps Drizzle's `id` field to Ditto's `_id`
- Document IDs must be unique within a collection (enforced by Ditto)
- Attempting to insert a document with an existing ID will fail with an "Identifier conflict" error

### Limitations

Unlike traditional SQL databases, Ditto has some limitations:

1. **No Schema Enforcement**: Ditto is schemaless - tables don't need to be created
2. **No Unique Constraints**: Only the `_id` field is unique (other unique constraints are ignored)
3. **No Foreign Keys**: Relationships are handled at application level
5. **No CREATE TABLE**: Table definitions in Drizzle are for type safety only

### Example: Error Handling

```typescript
import { DittoUnsupportedConstraintError, DittoUnsupportedOperationError } from '@dittolive/drizzle-driver';

// Schema validation errors (thrown at initialization)
try {
  const db = wrapDittoWithDrizzle(ditto, {
    schema: {
      users: sqliteTable('users', {
        id: text('id').primaryKey(),
        email: text('email').unique()  // Will throw!
      })
    }
  });
} catch (error) {
  if (error instanceof DittoUnsupportedConstraintError) {
    console.error('Schema contains unsupported constraints:', error.message);
  }
}

// Runtime SQL operation errors
try {
  // Attempting a JOIN will throw
  await db.select()
    .from(users)
    .innerJoin(posts, eq(users.id, posts.userId));
} catch (error) {
  if (error instanceof DittoUnsupportedOperationError) {
    console.error('Unsupported operation:', error.message);
    // Suggestion provided: "Fetch related data with separate queries"
  }
}

// Primary key enforcement (still works)
try {
  await db.insert(users).values({ id: '1', name: 'John' });
  await db.insert(users).values({ id: '1', name: 'Jane' }); // Duplicate ID
} catch (error) {
  // Error: "Identifier conflict on document '1'"
}
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

