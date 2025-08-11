# Ditto Drizzle Driver

A Drizzle ORM driver for Ditto SDK, allowing you to use Drizzle's familiar SQL-like syntax with Ditto's distributed database.

## Installation

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

### Schema Definition

Use Drizzle's SQLite schema builders:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  authorId: text('author_id').notNull(),
  createdAt: text('created_at').notNull()
});

const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull()
});

// Define relations (optional)
const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id]
  })
}));
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

### Testing

```bash
npm test
```

### Running Examples

```bash
cd examples
npx ts-node basic-usage.ts
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Acknowledgments

This driver is inspired by the [@powersync/drizzle-driver](https://github.com/powersync/powersync-js/tree/main/packages/drizzle-driver) implementation.