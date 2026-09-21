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
