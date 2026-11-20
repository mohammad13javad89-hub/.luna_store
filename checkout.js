const CART_KEY = 'lunaCart';

const checkoutForm = document.getElementById('checkoutForm');
const checkoutItems = document.getElementById('checkoutItems');
const checkoutTotal = document.getElementById('checkoutTotal');
const submitButton = checkoutForm.querySelector('button[type="submit"]');

function formatPrice(value) {
  return `${Number(value).toLocaleString('fa-IR')} تومان`;
}

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

async function loadSummary() {
  const cart = getCart();
  checkoutItems.replaceChildren();

  if (!cart.length) {
    checkoutItems.textContent = 'سبد خرید شما خالی است.';
    checkoutTotal.textContent = formatPrice(0);
    submitButton.disabled = true;
    return;
  }

  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) throw new Error('دریافت محصولات ناموفق بود.');
    const products = await response.json();
    let total = 0;

    for (const item of cart) {
      const product = products.find(entry => String(entry.id) === String(item.id));
      const quantity = Number(item.quantity);
      if (!product || !Number.isSafeInteger(quantity) || quantity < 1) continue;

      const row = document.createElement('div');
      row.className = 'checkout-item';
      const name = document.createElement('span');
      name.textContent = product.name;
      const details = document.createElement('span');
      details.textContent = `${quantity.toLocaleString('fa-IR')} عدد`;
      const price = document.createElement('strong');
      price.textContent = formatPrice(product.price * quantity);
      row.append(name, details, price);
      checkoutItems.appendChild(row);
      total += product.price * quantity;
    }

    checkoutTotal.textContent = formatPrice(total);
    if (!checkoutItems.childElementCount) {
      checkoutItems.textContent = 'محصولات سبد خرید در دسترس نیستند.';
      submitButton.disabled = true;
    }
  } catch (error) {
    checkoutItems.textContent = 'ارتباط با سرور برقرار نشد. صفحه را دوباره بارگذاری کنید.';
    submitButton.disabled = true;
    console.error(error);
  }
}

checkoutForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitButton.disabled) return;

  const cart = getCart();
  if (!cart.length) {
    alert('سبد خرید شما خالی است.');
    return;
  }

  const customer = {
    name: document.getElementById('customerName').value.trim(),
    phone: document.getElementById('customerPhone').value.trim(),
    province: document.getElementById('customerProvince').value.trim(),
    city: document.getElementById('customerCity').value.trim(),
    address: document.getElementById('customerAddress').value.trim(),
    postalCode: document.getElementById('postalCode').value.trim()
  };

  if (!/^09\d{9}$/.test(customer.phone)) {
    alert('شماره تماس معتبر نیست.');
    return;
  }
  if (!/^\d{10}$/.test(customer.postalCode)) {
    alert('کد پستی باید ۱۰ رقم باشد.');
    return;
  }

  submitButton.disabled = true;
  const originalText = submitButton.textContent;
  submitButton.textContent = 'در حال اتصال به درگاه...';

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer, items: cart.map(item => ({ id: item.id, quantity: item.quantity })) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'ثبت سفارش انجام نشد.');
    window.location.assign(result.paymentUrl);
  } catch (error) {
    alert(error.message || 'خطایی در ثبت سفارش رخ داد.');
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});

loadSummary();
