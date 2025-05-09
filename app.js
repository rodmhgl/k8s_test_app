// app.js - Main application file
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3000;

// Database connection test
async function testDbConnection() {
  const connectionString = process.env.DB_CONNECTION_STRING;

  if (!connectionString) {
    return {
      configured: false,
      connected: false,
      message: "Database not configured (no connection string provided)"
    };
  }

  // Determine DB type from connection string
  let dbType = 'unknown';
  if (connectionString.includes('postgres')) dbType = 'postgres';
  else if (connectionString.includes('mysql')) dbType = 'mysql';
  else if (connectionString.includes('mongodb')) dbType = 'mongodb';

  try {
    let connected = false;
    let message = '';

    // Simple ping based on database type
    switch (dbType) {
      case 'postgres':
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString });
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        connected = true;
        message = `Connected to PostgreSQL, server time: ${result.rows[0].now}`;
        break;

      case 'mysql':
        const mysql = require('mysql2/promise');
        const mysqlConn = await mysql.createConnection(connectionString);
        const [rows] = await mysqlConn.execute('SELECT NOW() as now');
        await mysqlConn.end();
        connected = true;
        message = `Connected to MySQL, server time: ${rows[0].now}`;
        break;

      case 'mongodb':
        const { MongoClient } = require('mongodb');
        const mongoClient = new MongoClient(connectionString);
        await mongoClient.connect();
        const adminDb = mongoClient.db().admin();
        const serverInfo = await adminDb.serverInfo();
        await mongoClient.close();
        connected = true;
        message = `Connected to MongoDB, version: ${serverInfo.version}`;
        break;

      default:
        message = `Unknown database type for connection string`;
        connected = false;
    }

    return {
      configured: true,
      connected,
      message,
      type: dbType
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      type: dbType,
      message: `Error connecting to database: ${error.message}`
    };
  }
}

// PVC test 
async function testPvc() {
  const pvcPath = process.env.PVC_PATH;

  if (!pvcPath) {
    return {
      configured: false,
      accessible: false,
      message: "PVC not configured (no path provided)"
    };
  }

  try {
    // Test if directory exists
    const stats = fs.statSync(pvcPath);

    // Try to write a test file
    const testFile = path.join(pvcPath, 'pvc-test.txt');
    const timestamp = new Date().toISOString();
    fs.writeFileSync(testFile, `PVC test at ${timestamp}`);

    // Read it back
    const content = fs.readFileSync(testFile, 'utf8');

    return {
      configured: true,
      accessible: true,
      message: `PVC is accessible, successfully wrote test file: ${testFile}`,
      path: pvcPath,
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    return {
      configured: true,
      accessible: false,
      message: `Error accessing PVC: ${error.message}`,
      path: pvcPath
    };
  }
}

// Get pod information
async function getPodInfo() {
  const podName = process.env.HOSTNAME || os.hostname();
  const podIP = getHostIP();

  return {
    name: podName,
    ip: podIP,
    os: os.type(),
    platform: os.platform(),
    memory: {
      total: `${Math.round(os.totalmem() / (1024 * 1024))} MB`,
      free: `${Math.round(os.freemem() / (1024 * 1024))} MB`
    },
    uptime: `${Math.round(os.uptime() / 60)} minutes`,
    cpus: os.cpus().length
  };
}

// Get host IP
function getHostIP() {
  const interfaces = os.networkInterfaces();
  for (const ifaceName in interfaces) {
    const iface = interfaces[ifaceName];
    for (const addr of iface) {
      // Skip internal and non-IPv4 addresses
      if (!addr.internal && addr.family === 'IPv4') {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

function getEnvironment() {
  // Get all environment variables
  const allEnvVars = { ...process.env };

  // Remove sensitive information
  const sensitiveKeys = ['DB_CONNECTION_STRING', 'PASSWORD', 'SECRET', 'KEY', 'TOKEN'];
  for (const key of Object.keys(allEnvVars)) {
    for (const sensitiveKey of sensitiveKeys) {
      if (key.toUpperCase().includes(sensitiveKey)) {
        allEnvVars[key] = '[REDACTED]';
      }
    }
  }

  // Get configured environment
  const environment = process.env.ENVIRONMENT || 'not set';
  const colorTheme = process.env.COLOR_THEME || 'blue';

  return {
    configured: environment !== 'not set',
    current: environment,
    colorTheme: colorTheme,
    variables: allEnvVars
  };
}

app.get('/api/status', async (req, res) => {
  try {
    const [dbStatus, pvcStatus, podInfo, envInfo] = await Promise.all([
      testDbConnection(),
      testPvc(),
      getPodInfo(),
      getEnvironment()
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      pod: podInfo,
      environment: envInfo,
      pvc: pvcStatus,
      database: dbStatus,
      message: 'Kubernetes Test App Running'
    });
  } catch (error) {
    res.status(500).json({
      error: `Error gathering status information: ${error.message}`
    });
  }
});

// Serve HTML UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static assets
app.use(express.static('public'));

// Start server
app.listen(PORT, () => {
  console.log(`Kubernetes Test App running on port ${PORT}`);
});