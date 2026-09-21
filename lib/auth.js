import { cookies } from "next/headers";
import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { dailyLimitForPlan, periodEndFrom, planIdForUser } from "./plans";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "db.json");
const sessionCookie = "nuvello_session";
const guestCookie = "nuvello_guest";
const secret = process.env.AUTH_SECRET || "dev-secret-change-before-production";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultDb() {
  return { users: [], sessions: [], usage: [], subscriptions: [], payments: [] };
}

function readDb() {
  let db;
  try {
    db = JSON.parse(readFileSync(dbPath, "utf8"));
  } catch {
    db = defaultDb();
    writeDb(db);
    return db;
  }

  // Older databases only had users/sessions/usage — fill in what is missing.
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.usage)) db.usage = [];
  if (!Array.isArray(db.subscriptions)) db.subscriptions = [];
  if (!Array.isArray(db.payments)) db.payments = [];
  return db;
}

function writeDb(db) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sign(value) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function packToken(value) {
  return `${value}.${sign(value)}`;
}

function unpackToken(value) {
  const [token, signature] = String(value || "").split(".");
  if (!token || !signature) return null;
  const expected = sign(token);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return token;
}

function hashPassword(password, salt = randomBytes(16).toString("base64url")) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("base64url");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(":")[1];
  const left = Buffer.from(candidate);
  const right = Buffer.from(hash);
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    role: user.role || "user",
    createdAt: user.createdAt,
    planSource: user.planSource || "manual",
    planSince: user.planSince || null,
    planRenewsAt: user.planRenewsAt || null,
    planLifetime: Boolean(user.planLifetime),
    subscriptionStatus: user.subscriptionStatus || null,
    hasBilling: Boolean(user.stripeCustomerId),
  };
}

export function createUser({ name, email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim();

  if (cleanName.length < 2) throw new Error("اكتب اسمك بشكل صحيح.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("البريد الإلكتروني غير صالح.");
  if (String(password || "").length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");

  const db = readDb();
  if (db.users.some((user) => user.email === cleanEmail)) throw new Error("هذا البريد مسجل مسبقاً.");

  const user = {
    id: randomUUID(),
    name: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(password),
    plan: "free",
    role: db.users.length === 0 ? "admin" : "user",
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  writeDb(db);
  return publicUser(user);
}

export function authenticateUser(email, password) {
  const db = readDb();
  const user = db.users.find((item) => item.email === normalizeEmail(email));
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("البريد أو كلمة المرور غير صحيحة.");
  }
  return publicUser(user);
}

export function createSession(userId) {
  const db = readDb();
  const token = randomBytes(32).toString("base64url");
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  };

  db.sessions.push(session);
  writeDb(db);
  return packToken(token);
}

export async function setSessionCookie(sessionValue) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const value = cookieStore.get(sessionCookie)?.value;
  const token = unpackToken(value);
  if (token) {
    const db = readDb();
    db.sessions = db.sessions.filter((session) => session.token !== token);
    writeDb(db);
  }
  cookieStore.delete(sessionCookie);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = unpackToken(cookieStore.get(sessionCookie)?.value);
  if (!token) return null;

  const db = readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session || new Date(session.expiresAt) <= new Date()) return null;
  return publicUser(db.users.find((user) => user.id === session.userId));
}

// Guests get their own quota, tracked against a signed cookie so the free plan
// cannot be reset by logging out.
export async function getGuestId({ create = false } = {}) {
  const cookieStore = await cookies();
  const existing = unpackToken(cookieStore.get(guestCookie)?.value);
  if (existing) return existing;
  if (!create) return null;

  const id = randomBytes(16).toString("base64url");
  cookieStore.set(guestCookie, packToken(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

// Usage is stored under a single subject key: a user id, or "guest:<cookie id>".
export function usageSubjectId(user, guestId) {
  if (user) return user.id;
  return guestId ? `guest:${guestId}` : null;
}

export function getUserUsage(subjectId) {
  if (!subjectId) return 0;
  const db = readDb();
  const date = todayKey();
  const usage = db.usage.find((item) => item.userId === subjectId && item.date === date);
  return usage?.count || 0;
}

// Reads, clamps and increments in a single synchronous pass, so two parallel
// batches can never push a subject past its daily limit.
export function reserveUsage(subjectId, requested, limit) {
  const db = readDb();
  const date = todayKey();
  let usage = db.usage.find((item) => item.userId === subjectId && item.date === date);
  const used = usage?.count || 0;
  const wanted = Math.max(0, Math.floor(Number(requested) || 0));
  const allowed = limit === null ? wanted : Math.max(0, Math.min(wanted, limit - used));

  if (allowed > 0) {
    if (!usage) {
      usage = { userId: subjectId, date, count: 0 };
      db.usage.push(usage);
    }
    usage.count = used + allowed;
    writeDb(db);
  }

  const total = used + allowed;
  return {
    allowed,
    usage: total,
    dailyLimit: limit,
    remaining: limit === null ? null : Math.max(0, limit - total),
  };
}

// Refunds quota for compressions that never produced a file (unreadable images).
export function releaseUsage(subjectId, count) {
  if (!subjectId) return 0;
  const db = readDb();
  const date = todayKey();
  const usage = db.usage.find((item) => item.userId === subjectId && item.date === date);
  const requested = Math.max(0, Math.floor(Number(count) || 0));
  const released = Math.min(usage?.count || 0, requested);
  if (usage && released > 0) {
    usage.count -= released;
    writeDb(db);
  }
  return released;
}

export function setUserPlan(userId, plan, { source = "manual" } = {}) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");

  const nextPlan = plan === "pro" ? "pro" : "free";
  if (nextPlan === "pro" && user.plan !== "pro") user.planSince = new Date().toISOString();
  if (nextPlan !== "pro") {
    user.planSince = null;
    user.planRenewsAt = null;
  }
  user.plan = nextPlan;
  user.planSource = source;
  writeDb(db);
  return publicUser(user);
}

export function getStripeCustomerId(userId) {
  const user = readDb().users.find((item) => item.id === userId);
  return user?.stripeCustomerId || null;
}

export function attachStripeCustomer(userId, stripeCustomerId) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");
  user.stripeCustomerId = stripeCustomerId;
  writeDb(db);
  return stripeCustomerId;
}

export function findUserByStripeCustomer(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  const user = readDb().users.find((item) => item.stripeCustomerId === stripeCustomerId);
  return publicUser(user);
}

export function getUserSubscription(userId) {
  return readDb().subscriptions.find((item) => item.userId === userId) || null;
}

// Webhook-driven source of truth: a Stripe subscription decides the plan.
// "active" and "trialing" mean Pro; anything else falls back to free.
export function applySubscription({ userId, stripeCustomerId, stripeSubscriptionId, status, priceId, currentPeriodEnd }) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");

  const isPro = ["active", "trialing"].includes(String(status));
  let subscription = db.subscriptions.find(
    (item) => (stripeSubscriptionId && item.stripeSubscriptionId === stripeSubscriptionId) || item.userId === userId,
  );
  if (!subscription) {
    subscription = { id: randomUUID(), userId, createdAt: new Date().toISOString() };
    db.subscriptions.push(subscription);
  }

  subscription.stripeCustomerId = stripeCustomerId || subscription.stripeCustomerId || null;
  subscription.stripeSubscriptionId = stripeSubscriptionId || subscription.stripeSubscriptionId || null;
  subscription.status = status || subscription.status || null;
  subscription.priceId = priceId || subscription.priceId || null;
  subscription.currentPeriodEnd = currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000).toISOString()
    : subscription.currentPeriodEnd || null;
  subscription.updatedAt = new Date().toISOString();

  if (stripeCustomerId) user.stripeCustomerId = stripeCustomerId;
  user.plan = isPro ? "pro" : "free";
  user.planSource = "stripe";
  user.subscriptionStatus = subscription.status;
  user.planRenewsAt = subscription.currentPeriodEnd;
  if (isPro && !user.planSince) user.planSince = new Date().toISOString();
  if (!isPro) user.planSince = null;

  writeDb(db);
  return { user: publicUser(user), subscription };
}

export function requireAdmin(user) {
  if (!user || user.role !== "admin") throw new Error("هذه الصفحة مخصصة للأدمن فقط.");
}

export function getAdminOverview() {
  const db = readDb();
  const today = todayKey();
  const todayUsage = db.usage
    .filter((item) => item.date === today)
    .reduce((total, item) => total + item.count, 0);

  const users = db.users
    .map((user) => {
      const usage = db.usage.find((item) => item.userId === user.id && item.date === today)?.count || 0;
      const activeSessions = db.sessions.filter((session) => session.userId === user.id && new Date(session.expiresAt) > new Date()).length;
      return {
        ...publicUser(user),
        usageToday: usage,
        activeSessions,
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    users,
    stats: {
      users: db.users.length,
      proUsers: db.users.filter((user) => user.plan === "pro").length,
      freeUsers: db.users.filter((user) => user.plan !== "pro").length,
      activeSessions: db.sessions.filter((session) => new Date(session.expiresAt) > new Date()).length,
      todayUsage,
    },
  };
}

export function setUserRole(userId, role) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");
  user.role = role === "admin" ? "admin" : "user";
  writeDb(db);
  return publicUser(user);
}

export function clearUserSessions(userId) {
  const db = readDb();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((session) => session.userId !== userId);
  writeDb(db);
  return before - db.sessions.length;
}

// ---------------------------------------------------------------------------
// Crypto payments (Cryptomus). The order id we generate is the key we look up
// on webhooks, so activation never depends on untrusted request data.
// ---------------------------------------------------------------------------

export function createPaymentRecord({ userId, kind, days, amountUsd, currency, network, orderId, providerUuid = null, address = null, expiresAt = null }) {
  const db = readDb();
  const now = new Date().toISOString();
  const payment = {
    id: randomUUID(),
    userId,
    provider: "cryptomus",
    kind,
    days: Number(days) || 0,
    amountUsd: Number(amountUsd) || 0,
    currency,
    network,
    orderId,
    providerUuid,
    address,
    expiresAt,
    status: "created",
    txid: null,
    payerAmount: null,
    grantedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.payments.push(payment);
  writeDb(db);
  return payment;
}

export function getPaymentByOrderId(orderId) {
  if (!orderId) return null;
  return readDb().payments.find((payment) => payment.orderId === orderId) || null;
}

export function getUserPayments(userId, limit = 20) {
  return readDb().payments
    .filter((payment) => payment.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export function getRecentPayments(limit = 10) {
  const db = readDb();
  const users = new Map(db.users.map((user) => [user.id, user]));
  return db.payments
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((payment) => ({
      ...payment,
      userName: users.get(payment.userId)?.name || null,
      userEmail: users.get(payment.userId)?.email || null,
    }));
}

// Idempotent: a replayed webhook never extends the plan twice.
export function applyCryptoPayment({ orderId, status, providerUuid, txid, payerAmount, isFinal }) {
  const db = readDb();
  const payment = db.payments.find((item) => item.orderId === orderId);
  if (!payment) return { found: false, granted: false };

  const now = new Date().toISOString();
  payment.status = status || payment.status;
  // Only adopt a provider uuid; never let a lookup overwrite the stored one.
  if (providerUuid && !payment.providerUuid) payment.providerUuid = providerUuid;
  payment.txid = txid || payment.txid;
  payment.payerAmount = payerAmount || payment.payerAmount;
  payment.isFinal = typeof isFinal === "boolean" ? isFinal : payment.isFinal ?? null;
  payment.updatedAt = now;

  const succeeded = ["paid", "paid_over"].includes(String(status));
  let granted = false;

  if (succeeded && !payment.grantedAt) {
    const user = db.users.find((item) => item.id === payment.userId);
    if (user) {
      if (payment.kind === "lifetime") {
        user.planLifetime = true;
        user.planRenewsAt = null;
      } else if (!user.planLifetime) {
        // Stack onto any remaining prepaid time instead of discarding it.
        const currentEnd = user.plan === "pro" && user.planSource === "crypto" && user.planRenewsAt
          ? new Date(user.planRenewsAt).getTime()
          : 0;
        const base = Math.max(Date.now(), Number.isFinite(currentEnd) ? currentEnd : 0);
        user.planRenewsAt = periodEndFrom(base, payment.days || 30);
      }
      user.plan = "pro";
      user.planSource = "crypto";
      user.subscriptionStatus = "paid";
      user.planSince = user.planSince || now;
      payment.grantedAt = now;
      granted = true;
    }
  }

  writeDb(db);
  return { found: true, granted, status: payment.status };
}

export function resetUserUsage(userId) {
  const db = readDb();
  const today = todayKey();
  let usage = db.usage.find((item) => item.userId === userId && item.date === today);
  if (!usage) {
    usage = { userId, date: today, count: 0 };
    db.usage.push(usage);
  }
  usage.count = 0;
  writeDb(db);
}
