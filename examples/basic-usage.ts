import { Ditto, DittoConfig } from '@dittolive/ditto';
import { wrapDittoWithDrizzle } from '../src';
import { relations } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { eq } from 'drizzle-orm';

// Define your schema using Drizzle's SQLite syntax
export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull()
});

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
  list_id: text('list_id').notNull(),
  created_at: text('created_at').notNull(),
  completed: text('completed')
});

// Define relations (optional)
export const listsRelations = relations(lists, ({ many }) => ({
  todos: many(todos)
}));

export const todosRelations = relations(todos, ({ one }) => ({
  list: one(lists, {
    fields: [todos.list_id],
    references: [lists.id]
  })
}));

// Combine schema
export const drizzleSchema = {
  lists,
  todos,
  listsRelations,
  todosRelations
};

async function main() {
  // Initialize Ditto
  const ditto = await Ditto.open({
    // Your Ditto configuration
    // For example:
    // appID: 'your-app-id',
    // token: 'your-token',
    // or for development:
    // playground: { token: 'your-playground-token', appID: 'your-app-id' }
  } as DittoConfig);

  // Wrap Ditto with Drizzle
  const db = wrapDittoWithDrizzle(ditto, {
    schema: drizzleSchema,
    logger: true // Enable query logging
  });

  // Example 1: Insert data
  console.log('Inserting data...');
  await db.insert(lists).values({
    id: 'list-1',
    name: 'Shopping List'
  });

  await db.insert(todos).values([
    {
      id: 'todo-1',
      description: 'Buy milk',
      list_id: 'list-1',
      created_at: new Date().toISOString(),
      completed: 'false'
    },
    {
      id: 'todo-2',
      description: 'Buy bread',
      list_id: 'list-1',
      created_at: new Date().toISOString(),
      completed: 'false'
    }
  ]);

  // Example 2: Query data
  console.log('\\nQuerying all lists:');
  const allLists = await db.select().from(lists);
  console.log(allLists);

  // Example 3: Query with WHERE clause
  console.log('\\nQuerying todos for list-1:');
  const listTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.list_id, 'list-1'));
  console.log(listTodos);

  // Example 4: Update data
  console.log('\\nMarking todo as completed...');
  await db
    .update(todos)
    .set({ completed: 'true' })
    .where(eq(todos.id, 'todo-1'));

  // Example 5: Query updated data
  const completedTodos = await db
    .select()
    .from(todos)
    .where(eq(todos.completed, 'true'));
  console.log('Completed todos:', completedTodos);

  // Example 6: Transaction example
  console.log('\\nRunning transaction...');
  await db.transaction(async (tx) => {
    // Insert a new list
    await tx.insert(lists).values({
      id: 'list-2',
      name: 'Work Tasks'
    });

    // Insert todos for the new list
    await tx.insert(todos).values({
      id: 'todo-3',
      description: 'Finish report',
      list_id: 'list-2',
      created_at: new Date().toISOString(),
      completed: 'false'
    });

    console.log('Transaction completed successfully');
  });

  // Example 7: Delete data
  console.log('\\nDeleting completed todos...');
  await db
    .delete(todos)
    .where(eq(todos.completed, 'true'));

  // Final query to show remaining data
  console.log('\\nRemaining todos:');
  const remainingTodos = await db.select().from(todos);
  console.log(remainingTodos);

  // Clean up
  await ditto.close();
}

// Run the example
main().catch(console.error);