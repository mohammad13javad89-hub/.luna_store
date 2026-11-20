'use strict';
const $ = id => document.getElementById(id);
const loginPanel = $('loginPanel');
const adminApp = $('adminApp');
const loginForm = $('loginForm');
const loginMessage = $('loginMessage');
const loginButton = $('loginButton');
const logoutButton = $('logoutButton');
const backupButton = $('backupButton');
const form = $('productForm');
const productTable = $('productTable');
const productSearch = $('productSearch');
const orderSearch = $('orderSearch');
const orderStatusFilter = $('orderStatusFilter');
const orderTable = $('ordersTable');
const ordersEmpty = $('ordersEmpty');
const imagePreview = $('imagePreview');
let products = [];
let orders = [];
let uploadedMainImage = '';
let uploadedGalleryImages = [];

const categoryNames = { manteau: 'مانتو', formal: 'لباس مجلسی', casual: 'لباس روزمره', sport: 'لباس اسپرت', other: 'سایر' };
const statusLabels = {
  pending_payment: 'در انتظار پرداخت', paid: 'پرداخت‌شده', processing: 'در حال آماده‌سازی', shipped: 'ارسال‌شده',
  delivered: 'تحویل‌شده', cancelled: 'لغوشده', payment_cancelled: 'پرداخت لغوشده', payment_failed: 'پرداخت ناموفق',
  payment_expired: 'مهلت پرداخت تمام‌شده', payment_setup_failed: 'خطای اتصال به درگاه'
};
const editableStatuses = [ ['processing','در حال آماده‌سازی'], ['shipped','ارسال‌شده'], ['delivered','تحویل‌شده'], ['cancelled','لغوشده'] ];
const money = value => `${Number(value || 0).toLocaleString('fa-IR')} تومان`;
const escapeMessage = error => error?.message || 'عملیات انجام نشد.';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(data.error || 'ارتباط با سرور ناموفق بود.');
  }
  return data;
}
function showLogin(message = '') {
  adminApp.hidden = true; loginPanel.hidden = false; logoutButton.hidden = true; backupButton.hidden = true;
  loginMessage.textContent = message;
}
function showAdmin() { loginPanel.hidden = true; adminApp.hidden = false; logoutButton.hidden = false; backupButton.hidden = false; }
async function checkSession() {
  try { await api('/api/admin/me'); showAdmin(); }
  catch { showLogin(); return; }
  try { await refreshAll(); } catch (error) { alert(escapeMessage(error)); }
}
loginForm.addEventListener('submit', async event => {
  event.preventDefault(); loginButton.disabled = true; loginMessage.textContent = 'در حال بررسی...';
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: $('loginUsername').value.trim(), password: $('loginPassword').value }) });
    $('loginPassword').value = ''; showAdmin(); await refreshAll();
  } catch (error) { loginMessage.textContent = escapeMessage(error); }
  finally { loginButton.disabled = false; }
});
logoutButton.addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  showLogin('از حساب مدیر خارج شدید.');
});
async function refreshAll() { await Promise.all([loadProducts(), loadOrders()]); }
async function loadProducts() { products = await api('/api/admin/products'); renderProducts(); }
async function loadOrders() { orders = await api('/api/admin/orders'); renderOrders(); }

function getFormImages() {
  const main = $('productImage').value.trim() || uploadedMainImage;
  const extras = $('productImages').value.split('\n').map(value => value.trim()).filter(Boolean);
  return [...new Set([main, ...uploadedGalleryImages, ...extras].filter(Boolean))];
}
function renderPreview() {
  imagePreview.replaceChildren();
  getFormImages().forEach((url, index) => {
    const item = document.createElement('div'); item.className = 'preview-item';
    const img = document.createElement('img'); img.src = url; img.alt = `تصویر ${index + 1}`;
    const label = document.createElement('span'); label.textContent = index === 0 ? 'عکس اصلی' : `عکس ${index + 1}`;
    item.append(img, label); imagePreview.append(item);
  });
}
async function uploadFile(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('فرمت تصویر باید JPG، PNG یا WEBP باشد.');
  if (file.size > 4 * 1024 * 1024) throw new Error('حجم هر تصویر باید کمتر از ۴ مگابایت باشد.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('خواندن تصویر ناموفق بود.')); reader.readAsDataURL(file);
  });
  const result = await api('/api/admin/uploads', { method: 'POST', body: JSON.stringify({ data }) });
  return result.url;
}
$('mainImageFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { uploadedMainImage = await uploadFile(file); $('productImage').value = uploadedMainImage; renderPreview(); }
  catch (error) { alert(escapeMessage(error)); event.target.value = ''; }
});
$('galleryImageFiles').addEventListener('change', async event => {
  try {
    for (const file of event.target.files) uploadedGalleryImages.push(await uploadFile(file));
    $('productImages').value = [...new Set([...$('productImages').value.split('\n').filter(Boolean), ...uploadedGalleryImages])].join('\n');
    renderPreview();
  } catch (error) { alert(escapeMessage(error)); }
  event.target.value = '';
});
$('productImage').addEventListener('input', renderPreview);
$('productImages').addEventListener('input', renderPreview);

function renderProducts() {
  const query = $('productSearch').value.trim().toLocaleLowerCase();
  const visible = products.filter(item => item.name.toLocaleLowerCase().includes(query));
  productTable.replaceChildren();
  $('totalProducts').textContent = products.filter(item => item.active).length.toLocaleString('fa-IR');
  $('inventoryValue').textContent = money(products.filter(item => item.active).reduce((sum, item) => sum + item.price * item.stock, 0));
  if (!visible.length) { const row = productTable.insertRow(); const cell = row.insertCell(); cell.colSpan = 6; cell.textContent = 'محصولی پیدا نشد.'; return; }
  visible.forEach(product => {
    const row = productTable.insertRow();
    const name = row.insertCell(); name.textContent = `${product.name}${product.active ? '' : ' (غیرفعال)'}`;
    const category = row.insertCell(); category.textContent = categoryNames[product.category] || product.category;
    const price = row.insertCell(); price.textContent = money(product.price);
    const stock = row.insertCell(); stock.textContent = Number(product.stock).toLocaleString('fa-IR');
    const images = row.insertCell(); images.textContent = (product.images || []).length.toLocaleString('fa-IR');
    const actions = row.insertCell();
    const edit = document.createElement('button'); edit.className = 'secondary-button'; edit.textContent = 'ویرایش'; edit.addEventListener('click', () => editProduct(product));
    const toggle = document.createElement('button'); toggle.className = 'secondary-button'; toggle.textContent = product.active ? 'غیرفعال‌کردن' : 'فعال‌کردن'; toggle.addEventListener('click', async () => {
      try { await api(`/api/admin/products/${encodeURIComponent(product.id)}/active`, { method: 'PATCH', body: JSON.stringify({ active: !product.active }) }); await loadProducts(); }
      catch (error) { alert(escapeMessage(error)); }
    });
    const remove = document.createElement('button'); remove.className = 'secondary-button'; remove.textContent = 'حذف'; remove.addEventListener('click', async () => {
      if (!confirm('این محصول از فروشگاه پنهان شود؟ سفارش‌های قبلی حفظ می‌شوند.')) return;
      try { await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' }); await loadProducts(); }
      catch (error) { alert(escapeMessage(error)); }
    });
    actions.append(edit, toggle, remove);
  });
}
function editProduct(product) {
  $('productId').value = product.id; $('productName').value = product.name; $('productPrice').value = product.price;
  $('productCategory').value = product.category; $('productStock').value = product.stock;
  $('productImage').value = product.image || ''; $('productImages').value = (product.images || []).filter(item => item !== product.image).join('\n');
  $('productDescription').value = product.description || ''; uploadedMainImage = ''; uploadedGalleryImages = [];
  $('formTitle').textContent = 'ویرایش محصول'; $('submitButton').textContent = 'ذخیره تغییرات'; $('cancelEdit').hidden = false; renderPreview();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function resetForm() {
  form.reset(); $('productId').value = ''; $('productStock').value = 1; uploadedMainImage = ''; uploadedGalleryImages = [];
  $('formTitle').textContent = '➕ افزودن محصول جدید'; $('submitButton').textContent = 'ذخیره محصول'; $('cancelEdit').hidden = true; imagePreview.replaceChildren();
}
$('cancelEdit').addEventListener('click', resetForm);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const images = getFormImages();
  const payload = { name: $('productName').value.trim(), price: Number($('productPrice').value), category: $('productCategory').value, stock: Number($('productStock').value), image: images[0] || '', images, description: $('productDescription').value.trim() };
  const id = $('productId').value; const button = $('submitButton'); button.disabled = true;
  try {
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    resetForm(); await loadProducts(); alert('اطلاعات محصول در پایگاه داده ذخیره شد.');
  } catch (error) { alert(escapeMessage(error)); }
  finally { button.disabled = false; }
});
productSearch.addEventListener('input', renderProducts);

function renderOrders() {
  orderTable.replaceChildren();
  const paidOrders = orders.filter(order => ['paid','processing','shipped','delivered'].includes(order.status));
  $('totalOrders').textContent = orders.length.toLocaleString('fa-IR');
  $('pendingOrders').textContent = orders.filter(order => order.status === 'pending_payment').length.toLocaleString('fa-IR');
  $('processingOrders').textContent = orders.filter(order => ['paid','processing','shipped'].includes(order.status)).length.toLocaleString('fa-IR');
  $('deliveredOrders').textContent = orders.filter(order => order.status === 'delivered').length.toLocaleString('fa-IR');
  $('totalRevenue').textContent = money(paidOrders.reduce((sum, order) => sum + Number(order.total), 0));
  const query = orderSearch.value.trim().toLocaleLowerCase(); const filter = orderStatusFilter.value;
  const filtered = orders.filter(order => `${order.id} ${order.customer.name} ${order.customer.phone}`.toLocaleLowerCase().includes(query) && (filter === 'all' || (statusLabels[order.status] || order.status) === filter));
  ordersEmpty.hidden = filtered.length > 0;
  ordersEmpty.textContent = orders.length ? 'سفارشی با این مشخصات پیدا نشد.' : 'هنوز سفارشی ثبت نشده است.';
  filtered.forEach(order => {
    const row = orderTable.insertRow();
    [order.id, order.customer.name, order.customer.phone, money(order.total), statusLabels[order.status] || order.status].forEach(value => { row.insertCell().textContent = value; });
    const actions = row.insertCell();
    const details = document.createElement('button'); details.className = 'secondary-button'; details.textContent = 'جزئیات'; details.addEventListener('click', () => showOrderDetails(order)); actions.append(details);
    if (editableStatuses.some(([value]) => value === order.status) || order.status === 'pending_payment') {
      const select = document.createElement('select');
      editableStatuses.forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); });
      select.value = order.status === 'pending_payment' ? 'cancelled' : (order.status === 'paid' ? 'processing' : order.status);
      const save = document.createElement('button'); save.className = 'primary-button'; save.textContent = 'ثبت وضعیت';
      save.addEventListener('click', async () => {
        try { await api(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); await loadOrders(); }
        catch (error) { alert(escapeMessage(error)); }
      });
      actions.append(select, save);
    }
  });
}
function showOrderDetails(order) {
  const content = $('orderDetailsContent'); content.replaceChildren();
  const add = (label, value) => { const row = document.createElement('div'); row.className = 'order-detail-row'; const title = document.createElement('span'); title.textContent = label; const detail = document.createElement('strong'); detail.textContent = value || 'نامشخص'; row.append(title, detail); content.append(row); };
  add('شماره سفارش', order.id); add('نام مشتری', order.customer.name); add('شماره تماس', order.customer.phone); add('استان', order.customer.province); add('شهر', order.customer.city); add('آدرس', order.customer.address); add('کد پستی', order.customer.postalCode); add('وضعیت', statusLabels[order.status] || order.status); add('کد پیگیری پرداخت', order.paymentRef || '—');
  const title = document.createElement('h3'); title.textContent = 'محصولات سفارش'; content.append(title);
  order.items.forEach(item => { const line = document.createElement('p'); line.textContent = `${item.name} | تعداد: ${item.quantity} | قیمت واحد: ${money(item.price)}`; content.append(line); });
  add('مبلغ نهایی', money(order.total)); $('orderModal').hidden = false;
}
orderSearch.addEventListener('input', renderOrders); orderStatusFilter.addEventListener('change', renderOrders);
$('closeOrderModal').addEventListener('click', () => $('orderModal').hidden = true);
$('orderModal').addEventListener('click', event => { if (event.target === $('orderModal')) $('orderModal').hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('orderModal').hidden = true; });
checkSession();
setInterval(() => { if (!adminApp.hidden) refreshAll().catch(error => console.error(error)); }, 30000);

backupButton.addEventListener('click', async () => {
  backupButton.disabled = true;
  try {
    const response = await fetch('/api/admin/backup', { credentials: 'same-origin' });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'تهیه پشتیبان ناموفق بود.'); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `luna-backup-${new Date().toISOString().slice(0,10)}.sqlite`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { alert(escapeMessage(error)); }
  finally { backupButton.disabled = false; }
});
