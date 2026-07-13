const ngrok = require('ngrok');

(async function() {
  try {
    const url = await ngrok.connect(3000);
    console.log(`\n🌍 Your website is now PUBLICLY ACCESSIBLE at:\n`);
    console.log(`📱 Public URL: ${url}`);
    console.log(`\n✅ Share this URL with anyone to let them access your store!\n`);
    console.log(`Note: This URL is temporary and will change when you restart.\n`);
  } catch (err) {
    console.error('Error:', err);
  }
})();
