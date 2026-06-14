const apiKey = document.querySelector('#apiKey');
const metrics = document.querySelector('#metrics');
const orders = document.querySelector('#orders');
const withdrawals = document.querySelector('#withdrawals');
const importStatus = document.querySelector('#importStatus');

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
  const raw = document.querySelector('#ordersJson').value.trim();
  const payload = parseOrderImport(raw);
  const result = await request('/api/admin/orders/import', { method: 'POST', body: JSON.stringify(payload) });
  importStatus.textContent = `Imported ${result.imported} orders`;
  await loadSummary();
}

function parseOrderImport(raw) {
  if (!raw) return { orders: [] };
  if (raw.startsWith('{') || raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? { orders: parsed } : parsed;
  }
  const [headerLine, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(headerLine).map((item) => item.trim());
  return {
    orders: lines.map((line) => {
      const values = splitCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, normalizeCsvValue(values[index])]));
    }),
  };
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += char;
  }
  values.push(current);
  return values.map((item) => item.trim());
}

function normalizeCsvValue(value = '') {
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
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
