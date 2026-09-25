-- Выполнить в Supabase: SQL Editor -> New query -> вставить целиком -> Run

create table if not exists guests (
  telegram_id   bigint primary key,
  name          text not null,
  phone         text,
  created_at    timestamptz not null default now()
);

create table if not exists staff (
  telegram_id   bigint primary key,
  name          text,
  role          text not null default 'waiter', -- 'waiter' | 'admin'
  created_at    timestamptz not null default now()
);

create table if not exists visits (
  id            bigserial primary key,
  telegram_id   bigint not null references guests(telegram_id),
  checkin_code  text,          -- каким QR-кодом отметились
  receipt_code  text,          -- необязательный код чека
  created_at    timestamptz not null default now()
);

create table if not exists active_codes (
  code          text primary key,
  label         text,          -- например "Смена 25.09 вечер"
  created_at    timestamptz not null default now(),
  expires_at    timestamptz    -- null = бессрочный
);

create index if not exists visits_telegram_id_idx on visits(telegram_id);
create index if not exists visits_created_at_idx on visits(created_at);

-- Первого админа добавьте вручную, подставив свой telegram_id
-- (узнать свой telegram_id можно, написав боту @userinfobot)
-- insert into staff (telegram_id, name, role) values (123456789, 'Owner', 'admin');
