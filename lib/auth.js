import { cookies } from "next/headers";
import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import pg from "pg";
import { periodEndFrom } from "./plans";

const { Pool } = pg;

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "db.json");
const sessionCookie = "nuvello_session";
const guestCookie = "nuvello_guest";
const secret = process.env.AUTH_SECRET || "dev-secret-change-before-production";
const databaseUrl = process.env.DATABASE_URL;

let pool;
let schemaReady;

function usePostgres() {
  return Boolean(databaseUrl);
}

function requirePersistentDatabase() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("قاعدة البيانات غير مهيأة. أضف DATABASE_URL في Vercel Environment Variables ثم أعد النشر.");
  }
}

function client() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.POSTGRES_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!usePostgres()) return;
  if (!schemaReady) {
    schemaReady = client().query(`
      create table if not exists users (
        id text primary key,
        name text not null,
        email text not null unique,
        password_hash text not null,
        plan text not null default 'free',
        role text not null default 'user',
        created_at timestamptz not null default now(),
        plan_source text default 'manual',
        plan_since timestamptz,
        plan_renews_at timestamptz,
        plan_lifetime boolean not null default false,
        subscription_status text,
        stripe_customer_id text
      );
      create table if not exists sessions (
        token text primary key,
        user_id text not null references users(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
      create table if not exists usage (
        subject_id text not null,
        date text not null,
        count integer not null default 0,
        primary key (subject_id, date)
      );
      create table if not exists subscriptions (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        stripe_customer_id text,
        stripe_subscription_id text,
        status text,
        price_id text,
        current_period_end timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz
      );
      create table if not exists payments (
        id text primary key,
        user_id text not null references users(id) on delete cascade,
        provider text not null default 'cryptomus',
        kind text,
        days integer default 0,
        amount_usd numeric default 0,
        currency text,
        network text,
        order_id text unique,
        provider_uuid text,
        address text,
        expires_at timestamptz,
        status text,
        txid text,
        payer_amount text,
        is_final boolean,
        granted_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz
      );
    `);
  }
  await schemaReady;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function defaultDb() {
  return { users: [], sessions: [], usage: [], subscriptions: [], payments: [] };
}

function readDb() {
  requirePersistentDatabase();
  let db;
  try {
    db = JSON.parse(readFileSync(dbPath, "utf8"));
  } catch {
    db = defaultDb();
    writeDb(db);
    return db;
  }
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.usage)) db.usage = [];
  if (!Array.isArray(db.subscriptions)) db.subscriptions = [];
  if (!Array.isArray(db.payments)) db.payments = [];
  return db;
}

function writeDb(db) {
  requirePersistentDatabase();
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

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    plan: row.plan,
    role: row.role || "user",
    createdAt: iso(row.created_at || row.createdAt),
    planSource: row.plan_source || row.planSource || "manual",
    planSince: iso(row.plan_since || row.planSince),
    planRenewsAt: iso(row.plan_renews_at || row.planRenewsAt),
    planLifetime: Boolean(row.plan_lifetime ?? row.planLifetime),
    subscriptionStatus: row.subscription_status || row.subscriptionStatus || null,
    hasBilling: Boolean(row.stripe_customer_id || row.stripeCustomerId),
  };
}

function subscriptionFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    stripeCustomerId: row.stripe_customer_id || row.stripeCustomerId,
    stripeSubscriptionId: row.stripe_subscription_id || row.stripeSubscriptionId,
    status: row.status,
    priceId: row.price_id || row.priceId,
    currentPeriodEnd: iso(row.current_period_end || row.currentPeriodEnd),
    createdAt: iso(row.created_at || row.createdAt),
    updatedAt: iso(row.updated_at || row.updatedAt),
  };
}

function paymentFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    provider: row.provider,
    kind: row.kind,
    days: Number(row.days) || 0,
    amountUsd: Number(row.amount_usd ?? row.amountUsd) || 0,
    currency: row.currency,
    network: row.network,
    orderId: row.order_id || row.orderId,
    providerUuid: row.provider_uuid || row.providerUuid,
    address: row.address,
    expiresAt: iso(row.expires_at || row.expiresAt),
    status: row.status,
    txid: row.txid,
    payerAmount: row.payer_amount || row.payerAmount,
    isFinal: row.is_final ?? row.isFinal ?? null,
    grantedAt: iso(row.granted_at || row.grantedAt),
    createdAt: iso(row.created_at || row.createdAt),
    updatedAt: iso(row.updated_at || row.updatedAt),
  };
}

export async function createUser({ name, email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim();
  if (cleanName.length < 2) throw new Error("اكتب اسمك بشكل صحيح.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("البريد الإلكتروني غير صالح.");
  if (String(password || "").length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");

  if (usePostgres()) {
    await ensureSchema();
    const count = await client().query("select count(*)::int as count from users");
    try {
      const result = await client().query(
        `insert into users (id, name, email, password_hash, plan, role)
         values ($1, $2, $3, $4, 'free', $5) returning *`,
        [randomUUID(), cleanName, cleanEmail, hashPassword(password), count.rows[0].count === 0 ? "admin" : "user"],
      );
      return userFromRow(result.rows[0]);
    } catch (error) {
      if (error.code === "23505") throw new Error("هذا البريد مسجل مسبقاً.");
      throw error;
    }
  }

  const db = readDb();
  if (db.users.some((user) => user.email === cleanEmail)) throw new Error("هذا البريد مسجل مسبقاً.");
  const user = { id: randomUUID(), name: cleanName, email: cleanEmail, passwordHash: hashPassword(password), plan: "free", role: db.users.length === 0 ? "admin" : "user", createdAt: new Date().toISOString() };
  db.users.push(user);
  writeDb(db);
  return userFromRow(user);
}

export async function authenticateUser(email, password) {
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select * from users where email = $1", [normalizeEmail(email)]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) throw new Error("البريد أو كلمة المرور غير صحيحة.");
    return userFromRow(user);
  }
  const user = readDb().users.find((item) => item.email === normalizeEmail(email));
  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("البريد أو كلمة المرور غير صحيحة.");
  return userFromRow(user);
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  if (usePostgres()) {
    await ensureSchema();
    await client().query("insert into sessions (token, user_id, expires_at) values ($1, $2, $3)", [token, userId, expiresAt]);
    return packToken(token);
  }
  const db = readDb();
  db.sessions.push({ token, userId, createdAt: new Date().toISOString(), expiresAt });
  writeDb(db);
  return packToken(token);
}

export async function setSessionCookie(sessionValue) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, sessionValue, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const token = unpackToken(cookieStore.get(sessionCookie)?.value);
  if (token) {
    if (usePostgres()) {
      await ensureSchema();
      await client().query("delete from sessions where token = $1", [token]);
    } else {
      const db = readDb();
      db.sessions = db.sessions.filter((session) => session.token !== token);
      writeDb(db);
    }
  }
  cookieStore.delete(sessionCookie);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = unpackToken(cookieStore.get(sessionCookie)?.value);
  if (!token) return null;
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query(
      `select users.* from sessions join users on users.id = sessions.user_id where sessions.token = $1 and sessions.expires_at > now()`,
      [token],
    );
    return userFromRow(result.rows[0]);
  }
  const db = readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session || new Date(session.expiresAt) <= new Date()) return null;
  return userFromRow(db.users.find((user) => user.id === session.userId));
}

export async function getGuestId({ create = false } = {}) {
  const cookieStore = await cookies();
  const existing = unpackToken(cookieStore.get(guestCookie)?.value);
  if (existing) return existing;
  if (!create) return null;
  const id = randomBytes(16).toString("base64url");
  cookieStore.set(guestCookie, packToken(id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

export function usageSubjectId(user, guestId) {
  return user ? user.id : guestId ? `guest:${guestId}` : null;
}

export async function getUserUsage(subjectId) {
  if (!subjectId) return 0;
  const date = todayKey();
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select count from usage where subject_id = $1 and date = $2", [subjectId, date]);
    return Number(result.rows[0]?.count) || 0;
  }
  const usage = readDb().usage.find((item) => item.userId === subjectId && item.date === date);
  return usage?.count || 0;
}

export async function reserveUsage(subjectId, requested, limit) {
  const date = todayKey();
  const wanted = Math.max(0, Math.floor(Number(requested) || 0));
  if (usePostgres()) {
    await ensureSchema();
    const dbClient = await client().connect();
    try {
      await dbClient.query("begin");
      const current = await dbClient.query("select count from usage where subject_id = $1 and date = $2 for update", [subjectId, date]);
      const used = Number(current.rows[0]?.count) || 0;
      const allowed = limit === null ? wanted : Math.max(0, Math.min(wanted, limit - used));
      const total = used + allowed;
      if (allowed > 0) {
        await dbClient.query(
          `insert into usage (subject_id, date, count) values ($1, $2, $3) on conflict (subject_id, date) do update set count = excluded.count`,
          [subjectId, date, total],
        );
      }
      await dbClient.query("commit");
      return { allowed, usage: total, dailyLimit: limit, remaining: limit === null ? null : Math.max(0, limit - total) };
    } catch (error) {
      await dbClient.query("rollback");
      throw error;
    } finally {
      dbClient.release();
    }
  }
  const db = readDb();
  let usage = db.usage.find((item) => item.userId === subjectId && item.date === date);
  const used = usage?.count || 0;
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
  return { allowed, usage: total, dailyLimit: limit, remaining: limit === null ? null : Math.max(0, limit - total) };
}

export async function releaseUsage(subjectId, count) {
  if (!subjectId) return 0;
  const date = todayKey();
  const requested = Math.max(0, Math.floor(Number(count) || 0));
  if (usePostgres()) {
    await ensureSchema();
    const used = await getUserUsage(subjectId);
    const released = Math.min(used, requested);
    if (released > 0) await client().query("update usage set count = greatest(0, count - $3) where subject_id = $1 and date = $2", [subjectId, date, released]);
    return released;
  }
  const db = readDb();
  const usage = db.usage.find((item) => item.userId === subjectId && item.date === date);
  const released = Math.min(usage?.count || 0, requested);
  if (usage && released > 0) {
    usage.count -= released;
    writeDb(db);
  }
  return released;
}

export async function setUserPlan(userId, plan, { source = "manual" } = {}) {
  const nextPlan = plan === "pro" ? "pro" : "free";
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query(
      `update users set plan = $2, plan_source = $3, plan_since = case when $2 = 'pro' and plan <> 'pro' then now() else plan_since end, plan_renews_at = case when $2 = 'pro' then plan_renews_at else null end where id = $1 returning *`,
      [userId, nextPlan, source],
    );
    if (!result.rows[0]) throw new Error("المستخدم غير موجود.");
    return userFromRow(result.rows[0]);
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");
  if (nextPlan === "pro" && user.plan !== "pro") user.planSince = new Date().toISOString();
  if (nextPlan !== "pro") {
    user.planSince = null;
    user.planRenewsAt = null;
  }
  user.plan = nextPlan;
  user.planSource = source;
  writeDb(db);
  return userFromRow(user);
}

export async function getStripeCustomerId(userId) {
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select stripe_customer_id from users where id = $1", [userId]);
    return result.rows[0]?.stripe_customer_id || null;
  }
  return readDb().users.find((item) => item.id === userId)?.stripeCustomerId || null;
}

export async function attachStripeCustomer(userId, stripeCustomerId) {
  if (usePostgres()) {
    await ensureSchema();
    await client().query("update users set stripe_customer_id = $2 where id = $1", [userId, stripeCustomerId]);
    return stripeCustomerId;
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");
  user.stripeCustomerId = stripeCustomerId;
  writeDb(db);
  return stripeCustomerId;
}

export async function findUserByStripeCustomer(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select * from users where stripe_customer_id = $1", [stripeCustomerId]);
    return userFromRow(result.rows[0]);
  }
  return userFromRow(readDb().users.find((item) => item.stripeCustomerId === stripeCustomerId));
}

export async function getUserSubscription(userId) {
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select * from subscriptions where user_id = $1 order by updated_at desc nulls last, created_at desc limit 1", [userId]);
    return subscriptionFromRow(result.rows[0]);
  }
  return readDb().subscriptions.find((item) => item.userId === userId) || null;
}

export async function applySubscription({ userId, stripeCustomerId, stripeSubscriptionId, status, priceId, currentPeriodEnd }) {
  const isPro = ["active", "trialing"].includes(String(status));
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null;
  if (usePostgres()) {
    await ensureSchema();
    await client().query(
      `insert into subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, status, price_id, current_period_end, updated_at) values ($1,$2,$3,$4,$5,$6,$7,now())`,
      [randomUUID(), userId, stripeCustomerId, stripeSubscriptionId, status, priceId, periodEnd],
    );
    const userResult = await client().query(
      `update users set stripe_customer_id = coalesce($2, stripe_customer_id), plan = $3, plan_source = 'stripe', subscription_status = $4, plan_renews_at = $5, plan_since = case when $3 = 'pro' and plan_since is null then now() when $3 <> 'pro' then null else plan_since end where id = $1 returning *`,
      [userId, stripeCustomerId, isPro ? "pro" : "free", status, periodEnd],
    );
    return { user: userFromRow(userResult.rows[0]), subscription: await getUserSubscription(userId) };
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");
  let subscription = db.subscriptions.find((item) => (stripeSubscriptionId && item.stripeSubscriptionId === stripeSubscriptionId) || item.userId === userId);
  if (!subscription) {
    subscription = { id: randomUUID(), userId, createdAt: new Date().toISOString() };
    db.subscriptions.push(subscription);
  }
  subscription.stripeCustomerId = stripeCustomerId || subscription.stripeCustomerId || null;
  subscription.stripeSubscriptionId = stripeSubscriptionId || subscription.stripeSubscriptionId || null;
  subscription.status = status || subscription.status || null;
  subscription.priceId = priceId || subscription.priceId || null;
  subscription.currentPeriodEnd = periodEnd || subscription.currentPeriodEnd || null;
  subscription.updatedAt = new Date().toISOString();
  if (stripeCustomerId) user.stripeCustomerId = stripeCustomerId;
  user.plan = isPro ? "pro" : "free";
  user.planSource = "stripe";
  user.subscriptionStatus = subscription.status;
  user.planRenewsAt = subscription.currentPeriodEnd;
  if (isPro && !user.planSince) user.planSince = new Date().toISOString();
  if (!isPro) user.planSince = null;
  writeDb(db);
  return { user: userFromRow(user), subscription };
}

export function requireAdmin(user) {
  if (!user || user.role !== "admin") throw new Error("هذه الصفحة مخصصة للأدمن فقط.");
}

export async function getAdminOverview() {
  const today = todayKey();
  if (usePostgres()) {
    await ensureSchema();
    const stats = await client().query(`select (select count(*)::int from users) as users, (select count(*)::int from users where plan = 'pro') as pro_users, (select count(*)::int from users where plan <> 'pro') as free_users, (select count(*)::int from sessions where expires_at > now()) as active_sessions, (select coalesce(sum(count),0)::int from usage where date = $1) as today_usage`, [today]);
    const users = await client().query(`select users.*, coalesce((select count from usage where subject_id = users.id and date = $1),0)::int as usage_today, (select count(*)::int from sessions where sessions.user_id = users.id and expires_at > now()) as active_sessions from users order by created_at desc`, [today]);
    return { stats: { users: stats.rows[0].users, proUsers: stats.rows[0].pro_users, freeUsers: stats.rows[0].free_users, activeSessions: stats.rows[0].active_sessions, todayUsage: stats.rows[0].today_usage }, users: users.rows.map((row) => ({ ...userFromRow(row), usageToday: row.usage_today, activeSessions: row.active_sessions })) };
  }
  const db = readDb();
  const todayUsage = db.usage.filter((item) => item.date === today).reduce((total, item) => total + item.count, 0);
  const users = db.users.map((user) => ({ ...userFromRow(user), usageToday: db.usage.find((item) => item.userId === user.id && item.date === today)?.count || 0, activeSessions: db.sessions.filter((session) => session.userId === user.id && new Date(session.expiresAt) > new Date()).length })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { users, stats: { users: db.users.length, proUsers: db.users.filter((user) => user.plan === "pro").length, freeUsers: db.users.filter((user) => user.plan !== "pro").length, activeSessions: db.sessions.filter((session) => new Date(session.expiresAt) > new Date()).length, todayUsage } };
}

export async function setUserRole(userId, role) {
  const nextRole = role === "admin" ? "admin" : "user";
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("update users set role = $2 where id = $1 returning *", [userId, nextRole]);
    if (!result.rows[0]) throw new Error("المستخدم غير موجود.");
    return userFromRow(result.rows[0]);
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("المستخدم غير موجود.");
  user.role = nextRole;
  writeDb(db);
  return userFromRow(user);
}

export async function clearUserSessions(userId) {
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("delete from sessions where user_id = $1", [userId]);
    return result.rowCount;
  }
  const db = readDb();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((session) => session.userId !== userId);
  writeDb(db);
  return before - db.sessions.length;
}

export async function resetUserUsage(userId) {
  const today = todayKey();
  if (usePostgres()) {
    await ensureSchema();
    await client().query(`insert into usage (subject_id, date, count) values ($1,$2,0) on conflict (subject_id, date) do update set count = 0`, [userId, today]);
    return;
  }
  const db = readDb();
  let usage = db.usage.find((item) => item.userId === userId && item.date === today);
  if (!usage) {
    usage = { userId, date: today, count: 0 };
    db.usage.push(usage);
  }
  usage.count = 0;
  writeDb(db);
}

export async function createPaymentRecord({ userId, kind, days, amountUsd, currency, network, orderId, providerUuid = null, address = null, expiresAt = null }) {
  const payment = { id: randomUUID(), userId, provider: "cryptomus", kind, days: Number(days) || 0, amountUsd: Number(amountUsd) || 0, currency, network, orderId, providerUuid, address, expiresAt, status: "created", txid: null, payerAmount: null, grantedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (usePostgres()) {
    await ensureSchema();
    await client().query(`insert into payments (id,user_id,provider,kind,days,amount_usd,currency,network,order_id,provider_uuid,address,expires_at,status,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [payment.id, userId, payment.provider, kind, payment.days, payment.amountUsd, currency, network, orderId, providerUuid, address, expiresAt, payment.status, payment.createdAt, payment.updatedAt]);
  } else {
    const db = readDb();
    db.payments.push(payment);
    writeDb(db);
  }
  return payment;
}

export async function getPaymentByOrderId(orderId) {
  if (!orderId) return null;
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select * from payments where order_id = $1", [orderId]);
    return paymentFromRow(result.rows[0]);
  }
  return readDb().payments.find((payment) => payment.orderId === orderId) || null;
}

export async function getUserPayments(userId, limit = 20) {
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query("select * from payments where user_id = $1 order by created_at desc limit $2", [userId, limit]);
    return result.rows.map(paymentFromRow);
  }
  return readDb().payments.filter((payment) => payment.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}

export async function getRecentPayments(limit = 10) {
  if (usePostgres()) {
    await ensureSchema();
    const result = await client().query(`select payments.*, users.name as user_name, users.email as user_email from payments left join users on users.id = payments.user_id order by payments.created_at desc limit $1`, [limit]);
    return result.rows.map((row) => ({ ...paymentFromRow(row), userName: row.user_name, userEmail: row.user_email }));
  }
  const db = readDb();
  const users = new Map(db.users.map((user) => [user.id, user]));
  return db.payments.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit).map((payment) => ({ ...payment, userName: users.get(payment.userId)?.name || null, userEmail: users.get(payment.userId)?.email || null }));
}

export async function applyCryptoPayment({ orderId, status, providerUuid, txid, payerAmount, isFinal }) {
  const succeeded = ["paid", "paid_over"].includes(String(status));
  if (usePostgres()) {
    await ensureSchema();
    const dbClient = await client().connect();
    try {
      await dbClient.query("begin");
      const paymentResult = await dbClient.query("select * from payments where order_id = $1 for update", [orderId]);
      const payment = paymentResult.rows[0];
      if (!payment) {
        await dbClient.query("commit");
        return { found: false, granted: false };
      }
      await dbClient.query(`update payments set status = coalesce($2,status), provider_uuid = coalesce(provider_uuid,$3), txid = coalesce($4,txid), payer_amount = coalesce($5,payer_amount), is_final = $6, updated_at = now() where order_id = $1`, [orderId, status, providerUuid, txid, payerAmount, typeof isFinal === "boolean" ? isFinal : payment.is_final]);
      let granted = false;
      if (succeeded && !payment.granted_at) {
        const userResult = await dbClient.query("select * from users where id = $1 for update", [payment.user_id]);
        const user = userResult.rows[0];
        if (user) {
          let planRenewsAt = user.plan_renews_at;
          let lifetime = user.plan_lifetime;
          if (payment.kind === "lifetime") {
            lifetime = true;
            planRenewsAt = null;
          } else if (!lifetime) {
            const currentEnd = user.plan === "pro" && user.plan_source === "crypto" && user.plan_renews_at ? new Date(user.plan_renews_at).getTime() : 0;
            const base = Math.max(Date.now(), Number.isFinite(currentEnd) ? currentEnd : 0);
            planRenewsAt = periodEndFrom(base, payment.days || 30);
          }
          await dbClient.query(`update users set plan = 'pro', plan_source = 'crypto', subscription_status = 'paid', plan_lifetime = $2, plan_renews_at = $3, plan_since = coalesce(plan_since, now()) where id = $1`, [user.id, lifetime, planRenewsAt]);
          await dbClient.query("update payments set granted_at = now() where order_id = $1", [orderId]);
          granted = true;
        }
      }
      await dbClient.query("commit");
      return { found: true, granted, status };
    } catch (error) {
      await dbClient.query("rollback");
      throw error;
    } finally {
      dbClient.release();
    }
  }
  const db = readDb();
  const payment = db.payments.find((item) => item.orderId === orderId);
  if (!payment) return { found: false, granted: false };
  const now = new Date().toISOString();
  payment.status = status || payment.status;
  if (providerUuid && !payment.providerUuid) payment.providerUuid = providerUuid;
  payment.txid = txid || payment.txid;
  payment.payerAmount = payerAmount || payment.payerAmount;
  payment.isFinal = typeof isFinal === "boolean" ? isFinal : payment.isFinal ?? null;
  payment.updatedAt = now;
  let granted = false;
  if (succeeded && !payment.grantedAt) {
    const user = db.users.find((item) => item.id === payment.userId);
    if (user) {
      if (payment.kind === "lifetime") {
        user.planLifetime = true;
        user.planRenewsAt = null;
      } else if (!user.planLifetime) {
        const currentEnd = user.plan === "pro" && user.planSource === "crypto" && user.planRenewsAt ? new Date(user.planRenewsAt).getTime() : 0;
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
