require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

// Parse DATABASE_URL: mysql://user:password@host:port/database
function parseDatabaseUrl(urlString) {
  const url = new URL(urlString);
  const database = url.pathname.replace(/^\/+/, '');

  return {
    host: url.hostname || 'localhost',
    port: parseInt(url.port, 10) || 3306,
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || ''),
    database,
  };
}

const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL);
if (!dbConfig.database) {
  throw new Error('DATABASE_URL must include a database name (e.g. mysql://root@localhost:3306/papas)');
}

const adapter = new PrismaMariaDb(dbConfig, { database: dbConfig.database });

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
