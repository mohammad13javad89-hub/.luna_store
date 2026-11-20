const config = {
  merchantId: process.env.ZARINPAL_MERCHANT_ID,
  sandbox: process.env.ZARINPAL_SANDBOX === 'true'
};

function apiBase() {
  return config.sandbox ? 'https://sandbox.zarinpal.com/pg/v4' : 'https://api.zarinpal.com/pg/v4';
}
function paymentBase() {
  return config.sandbox ? 'https://sandbox.zarinpal.com' : 'https://www.zarinpal.com';
}
async function post(path, body) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('پاسخ درگاه پرداخت قابل خواندن نیست.'); }
  if (!response.ok) throw new Error(`ارتباط با درگاه پرداخت ناموفق بود (HTTP ${response.status}).`);
  return result.data || {};
}
function validateConfiguration() {
  if (!config.merchantId || config.merchantId === 'YOUR_MERCHANT_ID') {
    throw new Error('درگاه پرداخت هنوز پیکربندی نشده است.');
  }
}
function rialAmount(amountToman) {
  if (!Number.isSafeInteger(amountToman) || amountToman <= 0 || !Number.isSafeInteger(amountToman * 10)) {
    throw new Error('مبلغ پرداخت معتبر نیست.');
  }
  return amountToman * 10;
}
async function requestPayment({ amountToman, description, mobile, callbackUrl }) {
  validateConfiguration();
  const data = await post('/payment/request.json', {
    merchant_id: config.merchantId,
    amount: rialAmount(amountToman),
    description: String(description || 'خرید از فروشگاه LUNA').slice(0, 500),
    callback_url: callbackUrl,
    metadata: mobile ? { mobile } : {}
  });
  if (data.code !== 100 || !data.authority) {
    throw new Error(`درخواست پرداخت از طرف درگاه پذیرفته نشد (کد ${data.code ?? 'نامشخص'}).`);
  }
  return { authority: data.authority, paymentUrl: `${paymentBase()}/pg/StartPay/${encodeURIComponent(data.authority)}` };
}
async function verifyPayment({ authority, amountToman }) {
  validateConfiguration();
  if (typeof authority !== 'string' || !authority || authority.length > 100) return { success: false, code: null };
  const data = await post('/payment/verify.json', {
    merchant_id: config.merchantId,
    amount: rialAmount(amountToman),
    authority
  });
  if (![100, 101].includes(data.code) || data.ref_id == null) return { success: false, code: data.code ?? null };
  return { success: true, refId: String(data.ref_id), code: data.code };
}
module.exports = { requestPayment, verifyPayment };
