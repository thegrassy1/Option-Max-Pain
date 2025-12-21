/**
 * Scheduled Data Refresh Script
 * Run this 3 times per day via cron job or scheduled task
 * 
 * Schedule:
 * - 9:30 AM (market open)
 * - 12:00 PM (midday)
 * - 4:00 PM (market close)
 * 
 * Cron examples:
 * 30 9 * * 1-5 /usr/bin/node /path/to/scripts/scheduled-refresh.js  # 9:30 AM weekdays
 * 0 12 * * 1-5 /usr/bin/node /path/to/scripts/scheduled-refresh.js  # 12:00 PM weekdays
 * 0 16 * * 1-5 /usr/bin/node /path/to/scripts/scheduled-refresh.js  # 4:00 PM weekdays
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-token';

async function refreshData() {
  const url = new URL(`${API_URL}/api/refresh`);
  const protocol = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log('✅ Refresh successful:', result);
            resolve(result);
          } else {
            console.error('❌ Refresh failed:', result);
            reject(new Error(result.error || 'Refresh failed'));
          }
        } catch (error) {
          console.error('❌ Parse error:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.end();
  });
}

// Run if called directly
if (require.main === module) {
  refreshData()
    .then(() => {
      console.log('Refresh completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Refresh failed:', error);
      process.exit(1);
    });
}

module.exports = { refreshData };



