import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const initialState = {
  users: [],
  groups: [],
  links: [],
  orders: [],
  withdrawals: [],
  settings: {
    cashbackShareRate: Number(process.env.SHOPEE_DEFAULT_CASHBACK_RATE ?? 0.7),
    minWithdrawalAmount: 50000,
  },
};

export class JsonStore {
  constructor(dataDir = process.env.DATA_DIR ?? './data') {
    this.filePath = path.join(dataDir, 'cashback-store.json');
    this.dataDir = dataDir;
    this.state = structuredClone(initialState);
    this.queue = Promise.resolve();
  }

  async load() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.state = { ...structuredClone(initialState), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  async save() {
    this.queue = this.queue.then(() =>
      writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8'),
    );
    return this.queue;
  }

  upsertUser({ zaloUserId, displayName = 'Zalo user' }) {
    let user = this.state.users.find((item) => item.zaloUserId === zaloUserId);
    if (!user) {
      user = { id: crypto.randomUUID(), zaloUserId, displayName, payoutAccounts: [], defaultPayoutAccountId: null, createdAt: new Date().toISOString() };
      this.state.users.push(user);
    } else if (displayName && user.displayName !== displayName) {
      user.displayName = displayName;
    }
    user.payoutAccounts ??= [];
    user.defaultPayoutAccountId ??= user.payoutAccounts.find((item) => item.isDefault)?.id ?? null;
    return user;
  }

  upsertGroup({ zaloGroupId, name = 'Zalo group' }) {
    if (!zaloGroupId) return null;
    let group = this.state.groups.find((item) => item.zaloGroupId === zaloGroupId);
    if (!group) {
      group = { id: crypto.randomUUID(), zaloGroupId, name, cashbackShareRate: null, createdAt: new Date().toISOString() };
      this.state.groups.push(group);
    }
    return group;
  }

  createLink({ userId, groupId, originalUrl, affiliateUrl, trackingId }) {
    const link = {
      id: crypto.randomUUID(),
      userId,
      groupId,
      originalUrl,
      affiliateUrl,
      trackingId,
      createdAt: new Date().toISOString(),
    };
    this.state.links.push(link);
    return link;
  }

  importOrder(order) {
    const existing = this.state.orders.find((item) => item.shopeeOrderId === order.shopeeOrderId);
    const link = this.state.links.find((item) => item.trackingId === order.trackingId);
    const shareRate = this.cashbackShareRate(link?.groupId);
    const cashbackAmount = Math.floor(Number(order.commissionAmount || 0) * shareRate);
    const payload = {
      ...order,
      userId: link?.userId ?? null,
      groupId: link?.groupId ?? null,
      cashbackAmount,
      updatedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, payload);
    else this.state.orders.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...payload });
    return payload;
  }


  addPayoutAccount({ userId, method, accountInfo }) {
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found');
    user.payoutAccounts ??= [];
    const normalizedMethod = String(method).toLowerCase();
    const account = {
      id: crypto.randomUUID(),
      method: normalizedMethod,
      accountInfo,
      isDefault: true,
      createdAt: new Date().toISOString(),
    };
    for (const item of user.payoutAccounts) item.isDefault = false;
    user.payoutAccounts.push(account);
    user.defaultPayoutAccountId = account.id;
    return account;
  }

  defaultPayoutAccount(userId) {
    const user = this.state.users.find((item) => item.id === userId);
    const accounts = user?.payoutAccounts ?? [];
    return accounts.find((item) => item.id === user?.defaultPayoutAccountId) ?? accounts.find((item) => item.isDefault) ?? accounts.at(-1) ?? null;
  }

  requestWithdrawal({ userId, amount, method, accountInfo }) {
    const withdrawal = {
      id: crypto.randomUUID(),
      userId,
      amount: Number(amount),
      method,
      accountInfo,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.state.withdrawals.push(withdrawal);
    return withdrawal;
  }

  userSummary(userId) {
    const orders = this.state.orders.filter((item) => item.userId === userId);
    const approved = orders.filter((item) => ['approved', 'payable', 'paid'].includes(item.status));
    const paidWithdrawals = this.state.withdrawals.filter((item) => item.userId === userId && item.status === 'paid');
    const pendingWithdrawals = this.state.withdrawals.filter((item) => item.userId === userId && item.status === 'pending');
    const earned = approved.reduce((sum, item) => sum + Number(item.cashbackAmount || 0), 0);
    const paid = paidWithdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const locked = pendingWithdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { earned, paid, locked, available: Math.max(earned - paid - locked, 0), orders };
  }

  cashbackShareRate(groupId) {
    const group = this.state.groups.find((item) => item.id === groupId);
    return Number(group?.cashbackShareRate ?? this.state.settings.cashbackShareRate);
  }
}
