const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
module.exports = defineConfig({
    testDir: './tests', workers: 1, retries: 0,
    use: { baseURL: 'https://127.0.0.1:5443', ignoreHTTPSErrors: true,
        launchOptions: { executablePath: process.env.FINANCES_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] } },
    webServer: {
        command: '../venv/bin/python ../tests/e2e_server.py',
        url: 'https://127.0.0.1:5443/open-finance',ignoreHTTPSErrors:true,reuseExistingServer:false,
        env: { FINANCES_E2E_TEST_SERVER:'1',PLUGGY_ENABLED:'true',OPEN_FINANCE_MODE:'sandbox',CRON_SECRET:'synthetic-cron-token-for-local-tests-only' }
    }
});
