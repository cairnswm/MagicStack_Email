const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getPort() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return null;

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*PORT\s*=\s*(\d+)/);
    if (match) return match[1];
  }
  return null;
}

const port = getPort();
if (!port) {
  console.log('[predev] No PORT found in .env, skipping port clear.');
  process.exit(0);
}

console.log(`[predev] Clearing port ${port}...`);

try {
  const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  const pids = new Set();

  for (const line of result.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== '0') {
      pids.add(pid);
    }
  }

  if (pids.size === 0) {
    console.log(`[predev] Port ${port} is free.`);
  } else {
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[predev] Killed PID ${pid} on port ${port}.`);
      } catch {
        // Process may have already exited
      }
    }
  }
} catch {
  console.log(`[predev] Port ${port} is free.`);
}
