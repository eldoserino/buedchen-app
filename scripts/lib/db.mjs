import mysql from 'mysql2/promise';
import 'dotenv/config';

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'buedchen',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'buedchen',
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit:    5,
});

export default pool;
