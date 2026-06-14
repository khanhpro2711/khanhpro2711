const apiKey = document.querySelector('#apiKey');
const metrics = document.querySelector('#metrics');
const orders = document.querySelector('#orders');
const withdrawals = document.querySelector('#withdrawals');

apiKey.value = localStorage.getItem('adminApiKey') || '';
apiKey.addEventListener('input', () => localStorage.setItem('adminApiKey', apiKey.value));
document.querySelector('#refreshBtn').addEventListener('click', loadSummary);
document.querySelector('#importBtn').addEventListener('click', importOrders);

async function loadSummary() {
  const data = await request('/api/admin/summary');
  metrics.innerHTML = ['users', 'groups', 'links'].map((key) => `<article class="card"><b>${key}</b><div class="metric">${data[key]}</div></article>`).join('');
  orders.innerHTML = data.orders.map((item) => `<tr><td>${item.trackingId}</td><td>${item.shopeeOrderId}</td><td>${vnd(item.commissionAmount)}</td><td>${vnd(item.cashbackAmount)}</td><td>${item.status}</td></tr>`).join('');
  withdrawals.innerHTML = data.withdrawals.map((item) => `<tr><td>${item.userId}</td><td>${vnd(item.amount)}</td><td>${item.method}</td><td>${item.status}</td><td>${item.accountInfo}</td></tr>`).join('');
}

async function importOrders() {
  const payload = JSON.parse(document.querySelector('#ordersJson').value || '{"orders":[]}');
  await request('/api/admin/orders/import', { method: 'POST', body: JSON.stringify(payload) });
  await loadSummary();
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'x-admin-api-key': apiKey.value, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function vnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')}đ`;
}

loadSummary().catch(console.error);
