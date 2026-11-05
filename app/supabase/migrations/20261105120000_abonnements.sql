-- Abonnement (spécification § 8) : il relève le quota d'imports. Repris de Cyber Academy
-- (20261020100000_abonnements.sql), sans essai gratuit : le quota gratuit en tient lieu.
-- L'état n'est écrit que par le serveur (fonctions Stripe, clé service_role) ; le navigateur le lit.

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null default 'incomplete' check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  )),
  price_id text,
  current_period_end timestamptz,
  -- Résilié : reste actif jusqu'à current_period_end, puis n'est plus facturé.
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "Lire son abonnement" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.subscriptions from anon;
revoke insert, update, delete, truncate, trigger, references on public.subscriptions from authenticated;

-- Payé, ou paiement refusé que Stripe retente encore. Mêmes règles que estActif() côté navigateur.
create function public.abonne(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user
      and status in ('active', 'trialing', 'past_due')
      and (current_period_end is null or current_period_end > now())
  );
$$;

-- ponytail: quotas provisoires (5 et 30), à fixer avec le prix après le test des modèles (étape 1).
create or replace function public.quota_imports_mensuel()
returns int
language sql
stable
security definer
set search_path = ''
as $$ select case when public.abonne(auth.uid()) then 30 else 5 end $$;

-- Un compte dont l'abonnement est encore facturé ne se supprime pas : Stripe continuerait de
-- prélever. Résilié (fin de période), il peut l'être.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and status in ('active', 'trialing', 'past_due', 'unpaid')
      and not cancel_at_period_end
  ) then
    raise exception 'Résilie d’abord ton abonnement.' using errcode = 'SQ409';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.abonne(uuid) from public, anon, authenticated;
