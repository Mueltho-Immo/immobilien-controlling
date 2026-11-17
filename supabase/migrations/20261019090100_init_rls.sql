-- ============================================================
-- Zugriffsregeln (Row Level Security)
-- ============================================================

alter table public.organizations       enable row level security;
alter table public.memberships         enable row level security;
alter table public.properties          enable row level security;
alter table public.units               enable row level security;
alter table public.expense_categories  enable row level security;
alter table public.audit_logs          enable row level security;

-- Hilfsfunktion: ist der angemeldete Nutzer Mitglied einer Organisation?
create or replace function public.is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Hilfsfunktion: darf der Nutzer schreiben (owner oder editor)?
create or replace function public.can_write(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

-- ---------- organizations ----------
create policy org_select on public.organizations
  for select using (public.is_member(id));

create policy org_update on public.organizations
  for update using (public.can_write(id));

-- ---------- memberships ----------
create policy member_select on public.memberships
  for select using (public.is_member(organization_id));

create policy member_write on public.memberships
  for all using (
    exists (
      select 1 from public.memberships m
      where m.organization_id = memberships.organization_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- ---------- properties ----------
create policy prop_select on public.properties
  for select using (public.is_member(organization_id));

create policy prop_insert on public.properties
  for insert with check (public.can_write(organization_id));

create policy prop_update on public.properties
  for update using (public.can_write(organization_id));

-- ---------- units ----------
create policy unit_select on public.units
  for select using (public.is_member(organization_id));

create policy unit_insert on public.units
  for insert with check (public.can_write(organization_id));

create policy unit_update on public.units
  for update using (public.can_write(organization_id));

-- ---------- expense_categories ----------
create policy cat_select on public.expense_categories
  for select using (public.is_member(organization_id));

create policy cat_write on public.expense_categories
  for all using (public.can_write(organization_id));

-- ---------- audit_logs (nur lesen; Schreiben nur über Server) ----------
create policy audit_select on public.audit_logs
  for select using (public.is_member(organization_id));
