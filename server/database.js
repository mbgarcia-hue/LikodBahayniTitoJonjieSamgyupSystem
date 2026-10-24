import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const databasePath = process.env.DATABASE_PATH || resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../data/restaurant.sqlite'
);

mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');

database.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    description TEXT,
    image TEXT,
    available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    current_stock REAL NOT NULL CHECK (current_stock >= 0),
    unit TEXT NOT NULL,
    low_stock_threshold REAL NOT NULL CHECK (low_stock_threshold >= 0),
    last_updated TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INTEGER PRIMARY KEY,
    qr_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (
      status IN ('available', 'occupied', 'reserved', 'pending_payment')
    ),
    current_order_id TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    table_number INTEGER NOT NULL,
    items_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
      status IN ('pending', 'preparing', 'ready', 'served', 'completed')
    ),
    time_ordered TEXT NOT NULL,
    total_amount REAL NOT NULL CHECK (total_amount >= 0),
    customer_notes TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    table_number INTEGER NOT NULL,
    total_bill REAL NOT NULL CHECK (total_bill >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'online')),
    timestamp TEXT NOT NULL
  );
`);

export default database;
