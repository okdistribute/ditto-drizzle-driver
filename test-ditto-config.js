const { Ditto, DittoConfig } = require('@dittolive/ditto');

async function test() {
  try {
    console.log('Creating DittoConfig...');
    const config = new DittoConfig('test-app-id', {
      type: 'smallPeersOnly'
    }, '/tmp/test-ditto');
    
    console.log('Config created:', JSON.stringify(config, null, 2));
    
    console.log('Opening Ditto...');
    const ditto = await Ditto.open(config);
    
    console.log('Ditto opened successfully!');
    console.log('Ditto instance:', ditto);
    
    await ditto.close();
    console.log('Ditto closed.');
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();