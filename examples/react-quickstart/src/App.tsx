import {
  Ditto,
  DittoConfig,
  SyncSubscription,
  Authenticator,
  init,
} from '@dittolive/ditto';
import { wrapDittoWithDrizzle, QueryObserver } from '@dittolive/drizzle-driver';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq } from 'drizzle-orm';
import './App.css';
import DittoInfo from './components/DittoInfo';
import { useEffect, useRef, useState } from 'react';
import TaskList from './components/TaskList';

const databaseId = import.meta.env.DITTO_DATABASE_ID;
const devToken = import.meta.env.DITTO_DEV_TOKEN;
const authUrl = import.meta.env.DITTO_AUTH_URL;

// Define the tasks table schema using Drizzle
const tasksTable = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
});

export type Task = {
  id: string;
  title: string;
  done: boolean;
  deleted: boolean;
};

const App = () => {
  const [error, setError] = useState<Error | null>(null);
  const ditto = useRef<Ditto | null>(null);
  const db = useRef<ReturnType<typeof wrapDittoWithDrizzle> | null>(null);
  const tasksSubscription = useRef<SyncSubscription | null>(null);
  const tasksObserver = useRef<QueryObserver | null>(null);

  const [syncActive, setSyncActive] = useState<boolean>(true);
  const [promisedInitialization, setPromisedInitialization] =
    useState<Promise<void> | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => {
    const initializeDitto = async () => {
      try {
        await init();
      } catch (e) {
        console.error('Failed to initialize Ditto:', e);
      }
    };

    if (!promisedInitialization) setPromisedInitialization(initializeDitto());
  }, [promisedInitialization]);

  useEffect(() => {
    if (!promisedInitialization) return;

    (async () => {
      await promisedInitialization;
        console.log(databaseId, authUrl);
      try {
        // Create a new Ditto instance with the identity
        // https://docs.ditto.live/sdk/latest/install-guides/js#integrating-ditto-and-starting-sync
        ditto.current = await Ditto.open(new DittoConfig(
          databaseId,
          {
            mode: 'server',
            url: authUrl,
          }
        ));
        ditto.current.auth.setExpirationHandler(async (ditto, expirationSeconds) => {
            // Authenticate when token is expiring
            try {
                await ditto.auth.login(
                    // Your development token, replace with your actual token
                    devToken,
                    // Use Authenticator.DEVELOPMENT_PROVIDER for playground, or your actual provider name
                    Authenticator.DEVELOPMENT_PROVIDER
                );
                console.log("Authentication successful");
            } catch (error) {
                console.error("Authentication failed:", error);
            }
        });

        // disable sync with v3 peers, required for DQL
        await ditto.current.disableSyncWithV3();

        // Disable DQL strict mode
        // when set to false, collection definitions are no longer required. SELECT queries will return and display all fields by default.
        // https://docs.ditto.live/dql/strict-mode
        await ditto.current.store.execute(
          'ALTER SYSTEM SET DQL_STRICT_MODE = false',
        );

        // Initialize Drizzle wrapper
        db.current = wrapDittoWithDrizzle(ditto.current, {
          schema: { tasksTable }
        });

        ditto.current.startSync();

        // Register a subscription, which determines what data syncs to this peer
        // https://docs.ditto.live/sdk/latest/sync/syncing-data#creating-subscriptions
        tasksSubscription.current = ditto.current.sync.registerSubscription(
          'SELECT * FROM tasks',
        );

        // Register observer using Drizzle's observe method
        // https://docs.ditto.live/sdk/latest/crud/observing-data-changes#setting-up-store-observers
        const query = db.current
          .select()
          .from(tasksTable)
          .where(eq(tasksTable.deleted, false))
          .orderBy(tasksTable.done);

        tasksObserver.current = db.current.observe(
          query,
          (results, metadata) => {
            setTasks(results as Task[]);
          }
        );
        
        setIsInitialized(true);
      } catch (e) {
        setError(e as Error);
        setIsInitialized(false);
      }

      return () => {
        tasksObserver.current?.cancel();
        ditto.current?.close();
        ditto.current = null;
      };
    })();
  }, [promisedInitialization]);

  const toggleSync = () => {
    if (syncActive) {
      ditto.current?.stopSync();
    } else {
      ditto.current?.startSync();
    }
    setSyncActive(!syncActive);
  };

  // https://docs.ditto.live/sdk/latest/crud/create
  const createTask = async (title: string) => {
    try {
      await db.current?.insert(tasksTable).values({
        id: crypto.randomUUID(),
        title,
        done: false,
        deleted: false,
      });
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  // https://docs.ditto.live/sdk/latest/crud/update
  const editTask = async (id: string, title: string) => {
    try {
      await db.current
        ?.update(tasksTable)
        .set({ title })
        .where(eq(tasksTable.id, id));
    } catch (error) {
      console.error('Failed to edit task:', error);
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      await db.current
        ?.update(tasksTable)
        .set({ done: !task.done })
        .where(eq(tasksTable.id, task.id));
      
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  // https://docs.ditto.live/sdk/latest/crud/delete#soft-delete-pattern
  const deleteTask = async (task: Task) => {
    try {
      await db.current
        ?.update(tasksTable)
        .set({ deleted: true })
        .where(eq(tasksTable.id, task.id));
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const ErrorMessage: React.FC<{ error: Error }> = ({ error }) => {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-100 text-red-700 p-6 rounded shadow-lg">
        <div className="flex justify-between items-center">
          <p>
            <b>Error</b>: {error.message}
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="ml-4 text-red-700 hover:text-red-900"
          >
            &times;
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-gray-100">
      <div className="h-full w-full flex flex-col container mx-auto items-center">
        {error && <ErrorMessage error={error} />}
        <DittoInfo
          appId={databaseId}
          token={devToken}
          syncEnabled={syncActive}
          onToggleSync={toggleSync}
          isInitialized={isInitialized}
        />
        <TaskList
          tasks={tasks}
          onCreate={createTask}
          onEdit={editTask}
          onToggle={toggleTask}
          onDelete={deleteTask}
          isInitialized={isInitialized}
        />
      </div>
    </div>
  );
};

export default App;