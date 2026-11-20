require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const db = require('./server/db');
const payment = require('./server/payment');
const auth = require('./server/auth');

const app = express();
const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) throw new Error('در محیط عملیاتی BASE_URL باید با HTTPS تنظیم شود.');
const uploadDir = path.join(__dirname, 'assets', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '8mb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 150, standardHeaders: 'draft-7', legacyHeaders: false }));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'تعداد تلاش‌های ورود زیاد است. کمی بعد دوباره تلاش کنید.' } });

const publicProduct = row => ({ ...row, images: JSON.parse(row.images || '[]'), active: Boolean(row.active) });
const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
const allowedStatuses = new Set(['processing', 'shipped', 'delivered', 'cancelled']);

function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return res.status(403).json({ error: 'درخواست مبدأ معتبر ندارد.' });
  try {
  const expected = new URL(baseUrl).origin;
    if (new URL(origin).origin !== expected) return res.status(403).json({ error: 'مبدأ درخواست مجاز نیست.' });
  } catch { return res.status(403).json({ error: 'مبدأ درخواست معتبر نیست.' }); }
  next();
}
function adminWrite(req, res, next) { sameOrigin(req, res, () => auth.requireAdmin(req, res, next)); }
function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function normalizeImages(body) {
  const image = text(body.image, 500);
  const images = Array.isArray(body.images) ? body.images.map(item => text(item, 500)).filter(Boolean).slice(0, 8) : [];
  const all = [...new Set([image, ...images])];
  if (all.some(item => !/^(assets\/[a-zA-Z0-9_./-]+|https:\/\/[^\s]+)$/.test(item) || item.includes('..'))) {
    throw new Error('آدرس تصویر معتبر نیست.');
  }
  return { image: image || all[0] || 'assets/manteau.svg', images: all };
}
function validateProduct(body) {
  const name = text(body.name, 120);
  const category = text(body.category, 40);
  const description = text(body.description, 3000);
  const price = Number(body.price);
  const stock = Number(body.stock);
  if (name.length < 2) throw new Error('نام محصول باید حداقل ۲ نویسه باشد.');
  if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000_000) throw new Error('قیمت محصول معتبر نیست.');
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1_000_000) throw new Error('موجودی محصول معتبر نیست.');
  if (!/^[a-zA-Z0-9_-]{2,40}$/.test(category)) throw new Error('دسته‌بندی محصول معتبر نیست.');
  return { name, category, description, price, stock, ...normalizeImages(body) };
}
function finishUnpaidOrder(orderId, status) {
  const finish = db.transaction(() => {
    const order = db.prepare('SELECT status, inventory_reserved FROM orders WHERE id = ?').get(orderId);
    if (!order || order.status !== 'pending_payment') return false;
    if (order.inventory_reserved) {
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
      for (const item of items) db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.quantity, item.product_id);
    }
    db.prepare('UPDATE orders SET status = ?, inventory_reserved = 0 WHERE id = ?').run(status, orderId);
    return true;
  });
  return finish();
}

function expireOldOrders() {
  const old = db.prepare("SELECT id FROM orders WHERE status = 'pending_payment' AND created_at < datetime('now', '-30 minutes')").all();
  for (const order of old) {
    const expire = db.transaction(() => {
      const current = db.prepare('SELECT status, inventory_reserved FROM orders WHERE id = ?').get(order.id);
      if (!current || current.status !== 'pending_payment') return;
      if (current.inventory_reserved) {
        const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id);
        for (const item of items) db.prepare('UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.quantity, item.product_id);
      }
      db.prepare("UPDATE orders SET status = 'payment_expired', inventory_reserved = 0 WHERE id = ?").run(order.id);
    });
    expire();
  }
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/products', (req, res) => {
  expireOldOrders();
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC, id DESC').all();
  res.json(products.map(publicProduct));
});
app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'محصول پیدا نشد.' });
  res.json(publicProduct(product));
});

// ورود و خروج مدیر
app.post('/api/admin/login', loginLimiter, sameOrigin, async (req, res) => {
  const username = text(req.body?.username, 30);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password || password.length > 200) return res.status(400).json({ error: 'نام کاربری یا رمز عبور معتبر نیست.' });
  const admin = db.prepare('SELECT id, username, password_hash FROM admins WHERE username = ?').get(username);
  const valid = admin && await auth.verifyPassword(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
  const session = auth.createAdminSession(admin.id);
  auth.setSessionCookie(res, session.token);
  res.json({ admin: { id: admin.id, username: admin.username }, expiresAt: session.expiresAt });
});
app.get('/api/admin/me', auth.requireAdmin, (req, res) => res.json({ admin: req.admin }));
app.post('/api/admin/logout', adminWrite, (req, res) => {
  auth.destroyAdminSession(req.adminToken);
  auth.clearSessionCookie(res);
  res.json({ success: true });
});

// مدیریت محصولات؛ تمام عملیات از دیتابیس انجام می‌شوند.
app.get('/api/admin/products', auth.requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC, id DESC').all();
  res.json(rows.map(publicProduct));
});
app.post('/api/admin/products', adminWrite, (req, res) => {
  try {
    const product = validateProduct(req.body || {});
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO products (id, name, price, category, stock, image, images, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(id, product.name, product.price, product.category, product.stock, product.image, JSON.stringify(product.images), product.description);
    res.status(201).json(publicProduct(getProduct.get(id)));
  } catch (error) { res.status(400).json({ error: error.message || 'ثبت محصول انجام نشد.' }); }
});
app.put('/api/admin/products/:id', adminWrite, (req, res) => {
  try {
    const current = getProduct.get(req.params.id);
    if (!current) return res.status(404).json({ error: 'محصول پیدا نشد.' });
    const product = validateProduct(req.body || {});
    db.prepare(`UPDATE products SET name = ?, price = ?, category = ?, stock = ?, image = ?, images = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(product.name, product.price, product.category, product.stock, product.image, JSON.stringify(product.images), product.description, req.params.id);
    res.json(publicProduct(getProduct.get(req.params.id)));
  } catch (error) { res.status(400).json({ error: error.message || 'ویرایش محصول انجام نشد.' }); }
});
app.patch('/api/admin/products/:id/active', adminWrite, (req, res) => {
  const active = req.body?.active;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'وضعیت محصول معتبر نیست.' });
  const result = db.prepare('UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(active ? 1 : 0, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'محصول پیدا نشد.' });
  res.json(publicProduct(getProduct.get(req.params.id)));
});
app.delete('/api/admin/products/:id', adminWrite, (req, res) => {
  const result = db.prepare('UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'محصول پیدا نشد.' });
  res.json({ success: true });
});

// آپلود تصویر با اعتبارسنجی امضای فایل؛ SVG و فایل اجرایی پذیرفته نمی‌شود.
app.post('/api/admin/uploads', adminWrite, (req, res) => {
  try {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.data || '');
    if (!match) return res.status(400).json({ error: 'فقط تصویر JPG، PNG یا WEBP مجاز است.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'حجم تصویر باید کمتر از ۴ مگابایت باشد.' });
    const signatures = { 'image/jpeg': buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff, 'image/png': buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'image/webp': buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' };
    if (!signatures[match[1]]) return res.status(400).json({ error: 'محتوای فایل با نوع تصویر مطابقت ندارد.' });
    const ext = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
    const filename = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), buffer, { flag: 'wx' });
    res.status(201).json({ url: `assets/uploads/${filename}` });
  } catch (error) { console.error('Image upload failed:', error); res.status(400).json({ error: 'بارگذاری تصویر انجام نشد.' }); }
});

// دریافت نسخه پشتیبان سازگار از SQLite؛ فقط برای مدیر واردشده
app.get('/api/admin/backup', auth.requireAdmin, async (req, res) => {
  const backupPath = path.join(require('node:os').tmpdir(), `luna-backup-${Date.now()}-${crypto.randomUUID()}.sqlite`);
  try {
    await db.backup(backupPath);
    res.download(backupPath, `luna-backup-${new Date().toISOString().slice(0, 10)}.sqlite`, error => {
      fs.promises.unlink(backupPath).catch(() => {});
      if (error && !res.headersSent) res.status(500).end();
    });
  } catch (error) {
    fs.promises.unlink(backupPath).catch(() => {});
    console.error('Database backup failed:', error);
    res.status(500).json({ error: 'تهیه نسخه پشتیبان انجام نشد.' });
  }
});

// مدیریت سفارش‌ها
app.get('/api/admin/orders', auth.requireAdmin, (req, res) => {
  expireOldOrders();
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const itemsQuery = db.prepare('SELECT product_id AS id, product_name AS name, unit_price AS price, quantity FROM order_items WHERE order_id = ?');
  res.json(orders.map(order => ({
    id: order.id, total: order.total, status: order.status, createdAt: order.created_at, paidAt: order.paid_at,
    paymentRef: order.payment_ref_id,
    customer: { name: order.customer_name, phone: order.phone, province: order.province, city: order.city, address: order.address, postalCode: order.postal_code },
    items: itemsQuery.all(order.id)
  })));
});
app.patch('/api/admin/orders/:id/status', adminWrite, (req, res) => {
  const status = text(req.body?.status, 30);
  if (!allowedStatuses.has(status)) return res.status(400).json({ error: 'وضعیت انتخاب‌شده معتبر نیست.' });
  const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'سفارش پیدا نشد.' });
  if (['paid', 'processing', 'shipped', 'delivered'].includes(current.status) && status === 'cancelled') return res.status(409).json({ error: 'سفارش پرداخت‌شده را نمی‌توان بدون انجام بازپرداخت لغو کرد.' });
  if (['cancelled', 'payment_failed', 'payment_expired', 'payment_setup_failed'].includes(current.status)) return res.status(409).json({ error: 'وضعیت این سفارش نهایی است.' });
  const nextStatus = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };
  if (status !== current.status && nextStatus[current.status] !== status && status !== 'cancelled') return res.status(409).json({ error: 'ترتیب تغییر وضعیت سفارش معتبر نیست.' });
  if (status === 'cancelled') finishUnpaidOrder(current.id, 'cancelled');
  else db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, current.id);
  res.json({ success: true, status });
});

// ثبت سفارش: قیمت و موجودی فقط از دیتابیس خوانده و موجودی بلافاصله رزرو می‌شود.
app.post('/api/checkout', async (req, res) => {
  const { customer, items } = req.body || {};
  if (!customer || !Array.isArray(items) || items.length === 0 || items.length > 30) return res.status(400).json({ error: 'اطلاعات سفارش معتبر نیست.' });
  const required = ['name', 'phone', 'province', 'city', 'address', 'postalCode'];
  if (required.some(key => typeof customer[key] !== 'string' || !customer[key].trim() || customer[key].length > 500)) return res.status(400).json({ error: 'تمام اطلاعات ارسال را کامل کنید.' });
  if (!/^09\d{9}$/.test(customer.phone) || !/^\d{10}$/.test(customer.postalCode)) return res.status(400).json({ error: 'شماره تماس یا کد پستی معتبر نیست.' });
  const normalized = new Map();
  for (const item of items) {
    const id = String(item?.id || ''); const quantity = Number(item?.quantity);
    if (!id || id.length > 80 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: 'تعداد یا شناسه یکی از محصولات معتبر نیست.' });
    normalized.set(id, (normalized.get(id) || 0) + quantity);
  }
  if ([...normalized.values()].some(quantity => quantity > 20)) return res.status(400).json({ error: 'تعداد یک محصول بیش از حد مجاز است.' });
  const orderId = crypto.randomUUID();
  const createOrder = db.transaction(() => {
    const orderItems = []; let total = 0;
    for (const [id, quantity] of normalized) {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
      if (!product) throw new Error('یکی از محصولات دیگر موجود نیست.');
      const reserved = db.prepare('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1 AND stock >= ?').run(quantity, id, quantity);
      if (reserved.changes !== 1) throw new Error(`موجودی ${product.name} کافی نیست.`);
      total += product.price * quantity;
      orderItems.push({ id, name: product.name, price: product.price, quantity });
    }
    if (!Number.isSafeInteger(total) || total <= 0 || total > 1_000_000_000_000) throw new Error('مبلغ سفارش معتبر نیست.');
    db.prepare(`INSERT INTO orders (id, customer_name, phone, province, city, address, postal_code, total, inventory_reserved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(orderId, text(customer.name, 100), customer.phone, text(customer.province, 100), text(customer.city, 100), text(customer.address, 500), customer.postalCode, total);
    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)');
    for (const item of orderItems) insertItem.run(orderId, item.id, item.name, item.price, item.quantity);
    return total;
  });
  let total;
  try { total = createOrder(); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    const result = await payment.requestPayment({ amountToman: total, description: `پرداخت سفارش LUNA ${orderId}`, mobile: customer.phone, callbackUrl: `${baseUrl}/api/payment/callback` });
    db.prepare('UPDATE orders SET payment_authority = ? WHERE id = ?').run(result.authority, orderId);
    return res.json({ orderId, paymentUrl: result.paymentUrl });
  } catch (error) {
    finishUnpaidOrder(orderId, 'payment_setup_failed');
    return res.status(503).json({ error: error.message || 'ارتباط با درگاه پرداخت برقرار نشد.' });
  }
});

app.get('/api/payment/callback', async (req, res) => {
  const { Authority, Status } = req.query;
  if (typeof Authority !== 'string' || Authority.length > 100) return res.redirect('/payment-result.html?status=invalid');
  const order = db.prepare('SELECT * FROM orders WHERE payment_authority = ?').get(Authority);
  if (!order) return res.redirect('/payment-result.html?status=invalid');
  if (order.status === 'paid') return res.redirect(`/payment-result.html?status=success&order=${encodeURIComponent(order.id)}`);
  if (order.status !== 'pending_payment') return res.redirect('/payment-result.html?status=review');
  if (Status !== 'OK') {
    finishUnpaidOrder(order.id, 'payment_cancelled');
    return res.redirect('/payment-result.html?status=cancelled');
  }
  try {
    const result = await payment.verifyPayment({ authority: Authority, amountToman: order.total });
    if (!result.success) {
      finishUnpaidOrder(order.id, 'payment_failed');
      return res.redirect('/payment-result.html?status=failed');
    }
    const finalize = db.transaction(() => {
      const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      if (current.status === 'paid') return;
      if (current.status !== 'pending_payment') throw new Error('وضعیت سفارش قابل تأیید نیست.');
      // سفارش‌های قدیمی که پیش از فعال‌شدن رزرو موجودی ساخته شده‌اند، هنگام تأیید پرداخت موجودی را کسر می‌کنند.
      if (!current.inventory_reserved) {
        const legacyItems = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id);
        for (const item of legacyItems) {
          const changed = db.prepare('UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?').run(item.quantity, item.product_id, item.quantity).changes;
          if (changed !== 1) throw new Error('موجودی کافی برای تکمیل سفارش قدیمی وجود ندارد.');
        }
      }
      db.prepare("UPDATE orders SET status = 'paid', payment_ref_id = ?, paid_at = CURRENT_TIMESTAMP, inventory_reserved = 0 WHERE id = ? AND status = 'pending_payment'").run(result.refId, order.id);
    });
    finalize();
    return res.redirect(`/payment-result.html?status=success&order=${encodeURIComponent(order.id)}`);
  } catch (error) {
    console.error('Payment verification/finalization failed:', error);
    return res.redirect('/payment-result.html?status=review');
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT id, total, status, created_at, paid_at FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'سفارش پیدا نشد.' });
  res.json(order);
});

// جلوگیری از انتشار کد سمت سرور و فایل دیتابیس از مسیر static
app.use(['/server', '/data'], (req, res) => res.sendStatus(404));
app.use(['/server.js', '/create-admin.js', '/node_modules', '/package.json', '/package-lock.json', '/.env', '/.env.example', '/README.md'], (req, res) => res.sendStatus(404));
app.use(express.static(path.join(__dirname), { dotfiles: 'deny', index: 'index.html', extensions: ['html'] }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'خطای داخلی سرور رخ داد.' });
});

const sessionCleanup = setInterval(() => db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now()), 60 * 60 * 1000);
sessionCleanup.unref();
app.listen(port, () => console.log(`LUNA is running on ${baseUrl}`));
