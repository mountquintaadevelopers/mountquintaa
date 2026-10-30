// Starts the whole project with one command: `npm run dev`
//   1. MariaDB (if it isn't already running)
//   2. Bookings API  -> http://localhost:4231
//   3. Website + admin panel -> http://localhost:3000
// Press Ctrl+C to stop everything.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = __dirname;
const MARIADB_BIN = process.env.MARIADB_BIN || 'C:\\Program Files\\MariaDB 13.0\\bin';
const MARIADB_INI = process.env.MARIADB_INI || path.join(MARIADB_BIN, '..', 'data', 'my.ini');

const children = [];
let startedMariaDb = false;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Print each line of a child's output with a coloured label in front
function pipeWithLabel(stream, label) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) console.log(`${label} ${line}`);
  });
}

// Run a script with the same node.exe that is running this file. Going through
// npm.cmd fails on some Windows setups ("Could not determine Node.js install directory").
function run(name, color, args, cwd) {
  const label = `\x1b[${color}m[${name}]\x1b[0m`;
  const child = spawn(process.execPath, args, { cwd, windowsHide: true });
  pipeWithLabel(child.stdout, label);
  pipeWithLabel(child.stderr, label);
  child.on('exit', (code) => console.log(`${label} stopped (exit code ${code})`));
  children.push(child);
  return child;
}

function installIfNeeded(folder) {
  if (fs.existsSync(path.join(ROOT, folder, 'node_modules'))) return;
  console.log(`Installing packages in ${folder}/ (first run only)...`);
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  spawnSync(process.execPath, [npmCli, 'install'], { cwd: path.join(ROOT, folder), stdio: 'inherit', windowsHide: true });
}

async function startMariaDb() {
  if (await isPortOpen(3306)) {
    console.log('[db] MariaDB is already running on port 3306');
    return true;
  }
  const mariadbd = path.join(MARIADB_BIN, 'mariadbd.exe');
  if (!fs.existsSync(mariadbd)) {
    console.log(`[db] MariaDB not found at ${mariadbd} - the bookings API will not work.`);
    return false;
  }
  console.log('[db] Starting MariaDB...');
  // MariaDB's own messages go to mariadb.log so they don't flood the terminal
  const logFile = path.join(ROOT, 'mariadb.log');
  const log = fs.openSync(logFile, 'w');
  const db = spawn(mariadbd, [`--defaults-file=${MARIADB_INI}`, '--console'], {
    stdio: ['ignore', log, log],
    windowsHide: true
  });
  db.on('exit', (code) => console.log(`[db] MariaDB stopped (exit code ${code}) - see mariadb.log`));
  children.push(db);
  startedMariaDb = true;
  const ready = await waitForPort(3306, 30);
  console.log(ready ? '[db] MariaDB ready' : `[db] MariaDB did not start within 30s - see ${logFile}`);
  return ready;
}

function shutdown() {
  console.log('\nStopping everything...');
  if (startedMariaDb) {
    // Graceful shutdown so the database files stay healthy
    spawnSync(path.join(MARIADB_BIN, 'mariadb-admin.exe'), ['-u', 'root', 'shutdown'], { stdio: 'ignore', windowsHide: true });
  }
  for (const child of children) {
    if (child.exitCode === null) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  installIfNeeded('api');
  installIfNeeded('website');

  const dbReady = await startMariaDb();
  if (dbReady) {
    // No --watch: on Windows it restarts on every database write (e.g. data/leads.db)
    run('api', '36', ['src/server.js'], path.join(ROOT, 'api'));
  }
  run('website', '32', ['server.js'], path.join(ROOT, 'website'));

  if (await waitForPort(3000, 30)) {
    console.log('\n  Website      -> http://localhost:3000');
    console.log('  Admin login  -> http://localhost:3000/admin  (or "Admin Login" on the home page)');
    if (dbReady) console.log('  Bookings API -> http://localhost:4231/v1');
    console.log('  Press Ctrl+C to stop everything\n');
  }
})();
