import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from './store.js';
import { createAffiliateUrl, buildTrackingId, extractShopeeUrl } from './shopee.js';
import { normalizeZaloEvent, sendZaloMessage } from './zalo.js';

const store = new JsonStore();
await store.load();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && req.url === '/') return staticFile(res, 'public/admin.html', 'text/html; charset=utf-8');
    if (req.method === 'GET' && req.url === '/admin.js') return staticFile(res, 'public/admin.js', 'text/javascript; charset=utf-8');
    if (req.method === 'POST' && req.url === '/webhooks/zalo') return handleZaloWebhook(req, res);
    if (req.method === 'GET' && req.url === '/api/admin/summary') return handleAdmin(req, res, () => summary());
    if (req.method === 'POST' && req.url === '/api/admin/orders/import') return handleAdmin(req, res, async (body) => importOrders(body));
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error.message });
  }
});

async function handleZaloWebhook(req, res) {
  const secret = process.env.ZALO_WEBHOOK_SECRET;
  if (secret && req.headers['x-bot-api-secret-token'] !== secret) {
    return json(res, 401, { error: 'Invalid webhook secret' });
  }

  const event = normalizeZaloEvent(await readJson(req));
  const user = store.upsertUser({ zaloUserId: event.userId, displayName: event.displayName });
  const group = store.upsertGroup({ zaloGroupId: event.groupId, name: event.groupName });
  const lowerText = event.text.trim().toLowerCase();

  if (lowerText.startsWith('/cashback')) {
    const account = store.userSummary(user.id);
    await sendZaloMessage(event.replyTarget, `💰 Số dư khả dụng: ${formatVnd(account.available)}\n⏳ Đang chờ rút: ${formatVnd(account.locked)}\n✅ Đã thanh toán: ${formatVnd(account.paid)}`);
  } else if (lowerText.startsWith('/rut')) {
    await handleWithdrawCommand(event, user);
  } else {
    const shopeeUrl = extractShopeeUrl(event.text);
    if (shopeeUrl) await handleShopeeLink(event, user, group, shopeeUrl);
  }

  await store.save();
  json(res, 200, { ok: true });
}

async function handleShopeeLink(event, user, group, shopeeUrl) {
  const trackingId = buildTrackingId({ user, group });
  const affiliateUrl = createAffiliateUrl(shopeeUrl, trackingId);
  store.createLink({ userId: user.id, groupId: group?.id ?? null, originalUrl: shopeeUrl, affiliateUrl, trackingId });
  await sendZaloMessage(event.replyTarget, `✅ Link cashback Shopee của bạn:\n${affiliateUrl}\n\n📌 Mã theo dõi: ${trackingId}\n💡 Gõ /cashback để xem số dư.`);
}

async function handleWithdrawCommand(event, user) {
  const [, amountText, method, ...accountParts] = event.text.trim().split(/\s+/);
  const amount = Number(amountText);
  const accountInfo = accountParts.join(' ');
  const account = store.userSummary(user.id);
  if (!amount || !['bank', 'momo'].includes(method) || !accountInfo) {
    await sendZaloMessage(event.replyTarget, 'Cú pháp rút tiền: /rut 50000 momo 09xxxxxxxx hoặc /rut 50000 bank VCB 0123456789 NGUYEN VAN A');
    return;
  }
  if (amount < store.state.settings.minWithdrawalAmount || amount > account.available) {
    await sendZaloMessage(event.replyTarget, `❌ Số tiền rút tối thiểu ${formatVnd(store.state.settings.minWithdrawalAmount)} và không vượt số dư ${formatVnd(account.available)}.`);
    return;
  }
  store.requestWithdrawal({ userId: user.id, amount, method, accountInfo });
  await sendZaloMessage(event.replyTarget, `✅ Đã tạo yêu cầu rút ${formatVnd(amount)} qua ${method.toUpperCase()}. Admin sẽ xử lý thủ công trong MVP.`);
}

async function handleAdmin(req, res, handler) {
  if (process.env.ADMIN_API_KEY && req.headers['x-admin-api-key'] !== process.env.ADMIN_API_KEY) {
    return json(res, 401, { error: 'Invalid admin API key' });
  }
  const body = req.method === 'POST' ? await readJson(req) : null;
  const result = await handler(body);
  await store.save();
  json(res, 200, result);
}

function importOrders(body) {
  const rows = Array.isArray(body?.orders) ? body.orders : [];
  const imported = rows.map((row) => store.importOrder(row));
  return { imported: imported.length };
}

function summary() {
  return {
    users: store.state.users.length,
    groups: store.state.groups.length,
    links: store.state.links.length,
    orders: store.state.orders,
    withdrawals: store.state.withdrawals,
    settings: store.state.settings,
  };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

async function staticFile(res, file, contentType) {
  const body = await readFile(path.resolve(file), 'utf8');
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')}đ`;
}

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Zalo Shopee cashback MVP listening on :${process.env.PORT ?? 3000}`);
});
