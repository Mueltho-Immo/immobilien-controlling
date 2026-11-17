-- ============================================================
-- Immobilien-Controlling: Kern-Tabellen
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Organisationen und Mitglieder ----------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'editor', 'viewer');

create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.member_role not null default 'viewer',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ---------- Immobilien und Einheiten ----------
create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  street              text,
  postal_code         text,
  city                text,
  country             text not null default 'DE',
  purchase_date       date,
  purchase_price      numeric(14,2),
  acquisition_tax     numeric(14,2),
  notary_costs        numeric(14,2),
  other_acq_costs     numeric(14,2),
  living_area_sqm     numeric(10,2),
  equity              numeric(14,2),
  current_value       numeric(14,2),
  current_value_date  date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id)
);

create type public.unit_type as enum ('apartment', 'parking', 'garage', 'commercial', 'other');

create table public.units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  label           text not null,
  unit_type       public.unit_type not null default 'apartment',
  area_sqm        numeric(10,2),
  target_rent     numeric(14,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

-- ---------- Kostenkategorien ----------
create type public.category_group as enum (
  'running_cost',
  'acquisition_cost',
  'financing_payment',
  'other'
);

create table public.expense_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  group_name      public.category_group not null default 'running_cost',
  is_active       boolean not null default true,
  sort_order      integer not null default 100,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

-- ---------- Audit-Log (nur anfügbar) ----------
create table public.audit_logs (
  id              bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id        uuid references auth.users(id),
  action          text not null,
  table_name      text not null,
  record_id       uuid,
  old_values      jsonb,
  new_values      jsonb,
  created_at      timestamptz not null default now()
);

create or replace function public.block_audit_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs ist nur anfügbar (kein UPDATE oder DELETE)';
end $$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.block_audit_changes();

-- ---------- Zeitstempel automatisch pflegen ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

create trigger units_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- ---------- Standard-Kategorien je Organisation ----------
create or replace function public.seed_default_categories()
returns trigger language plpgsql as $$
begin
  insert into public.expense_categories (organization_id, name, group_name, sort_order) values
    (new.id, 'Hausgeld / WEG-Umlage',       'running_cost', 10),
    (new.id, 'Versicherung',                'running_cost', 20),
    (new.id, 'Grundsteuer',                 'running_cost', 30),
    (new.id, 'Reparatur und Instandhaltung','running_cost', 40),
    (new.id, 'Verwaltung',                  'running_cost', 50),
    (new.id, 'Strom und Nebenkosten',       'running_cost', 60),
    (new.id, 'Grunderwerbsteuer',           'acquisition_cost', 10),
    (new.id, 'Notar und Grundbuch',         'acquisition_cost', 20),
    (new.id, 'Maklerprovision',             'acquisition_cost', 30),
    (new.id, 'Zins und Tilgung',            'financing_payment', 10),
    (new.id, 'Sonstiges',                   'other', 100);
  return new;
end $$;

create trigger organizations_seed_categories
  after insert on public.organizations
  for each row execute function public.seed_default_categories();