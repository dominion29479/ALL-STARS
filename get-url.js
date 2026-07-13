const http = require('http');

http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const tunnels = JSON.parse(data).tunnels;
    if (tunnels.length > 0) {
      console.log('\n🌍 Your website is now PUBLICLY ACCESSIBLE!\n');
      tunnels.forEach(t => {
        console.log(`📱 Public URL: ${t.public_url}`);
      });
      console.log(`\n✅ Share this URL with anyone to let them access your store!\n`);
    }
  });
}).on('error', err => console.error('Error:', err));
