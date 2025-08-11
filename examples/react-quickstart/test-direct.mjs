// Test script to directly query Ditto and see what's returned
import { Ditto, init } from '@dittolive/ditto';

async function testDirect() {
  await init();
  
  const ditto = new Ditto({
    type: 'offlinePlayground',
    appID: 'test-app',
    token: 'test-token'
  });

  // Disable sync with V3 (required for DQL mutations)
  await ditto.disableSyncWithV3();

  // Disable strict mode
  await ditto.store.execute('ALTER SYSTEM SET DQL_STRICT_MODE = false');

  // Insert a test task directly
  await ditto.store.execute(
    'INSERT INTO tasks DOCUMENTS (:task)',
    {
      task: {
        _id: 'test-123',
        title: 'Test Task',
        done: false,
        deleted: false
      }
    }
  );

  // Query directly
  const result = await ditto.store.execute('SELECT * FROM tasks');
  
  console.log('Direct Ditto query result:');
  console.log('Number of items:', result.items.length);
  console.log('First item:', JSON.stringify(result.items[0], null, 2));
  
  if (result.items.length > 0) {
    const firstItem = result.items[0].value;
    console.log('\nField names in first item:');
    console.log('Has _id?', '_id' in firstItem);
    console.log('Has id?', 'id' in firstItem);
    console.log('Field names:', Object.keys(firstItem));
    console.log('Full item value:', firstItem);
  }

  await ditto.close();
}

testDirect().catch(console.error);