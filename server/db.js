const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const databaseFile = path.resolve(process.env.DATABASE_FILE || './data/luna.sqlite');
fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

const db = new Database(databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK(price >= 0),
    category TEXT NOT NULL DEFAULT 'other',
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    image TEXT,
    images TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    province TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    total INTEGER NOT NULL CHECK(total > 0),
    status TEXT NOT NULL DEFAULT 'pending_payment',
    payment_authority TEXT UNIQUE,
    payment_ref_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TEXT,
    inventory_reserved INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
  ON admin_sessions(expires_at);
`);

// سازگاری دیتابیس‌های قدیمی با نسخه جدید
const productColumns = db.prepare("PRAGMA table_info(products)").all().map(column => column.name);
if (!productColumns.includes('images')) db.exec("ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT '[]'");
if (!productColumns.includes('active')) db.exec('ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
if (!productColumns.includes('created_at')) db.exec("ALTER TABLE products ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
if (!productColumns.includes('updated_at')) db.exec("ALTER TABLE products ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");

const orderColumns = db.prepare("PRAGMA table_info(orders)").all().map(column => column.name);
if (!orderColumns.includes('inventory_reserved')) {
  db.exec('ALTER TABLE orders ADD COLUMN inventory_reserved INTEGER NOT NULL DEFAULT 0');
}

const count = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
if (count === 0) {
  const insert = db.prepare(`INSERT INTO products
    (id, name, price, category, stock, image, description) VALUES
    (@id, @name, @price, @category, @stock, @image, @description)`);
  const seed = [
    { id: '1', name: 'مانتو تابستانی', price: 850000, category: 'manteau', stock: 10, image: 'assets/manteau.svg', description: 'مانتو مناسب استفاده روزمره' },
    { id: '2', name: 'لباس مجلسی', price: 1500000, category: 'formal', stock: 5, image: 'assets/formal.svg', description: 'لباس مناسب مهمانی' },
    { id: '3', name: 'ست لباس روزمره', price: 650000, category: 'casual', stock: 8, image: 'assets/casual.svg', description: 'ست لباس مناسب استفاده روزمره' },
    { id: '4', name: 'ست لباس اسپرت', price: 950000, category: 'sport', stock: 6, image: 'assets/sport.svg', description: 'ست لباس اسپرت' }
  ];
  const insertMany = db.transaction(items => items.forEach(item => insert.run(item)));
  insertMany(seed);
}

module.exports = db;
