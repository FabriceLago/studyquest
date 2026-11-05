-- Rappels (spécification § 7) : une notification par jour au plus, seulement si l'élève l'a
-- demandée, à l'heure choisie (entre 6 h et 22 h, heure de Paris), et seulement si aucune mission
-- n'est faite ce jour-là.

alter table public.profiles
  add column rappel time check (rappel between '06:00' and '22:00'),
  add column rappel_envoye date;
-- Le navigateur règle son heure de rappel (ou l'arrête avec null), comme son pseudo.
grant update (rappel) on public.profiles to authenticated;

-- Un abonnement aux notifications par navigateur. L'adresse est celle du service de notification
-- du navigateur : la fonction d'envoi n'écrit qu'aux services connus (_shared/rappels.ts).
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https?://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on public.push_subscriptions (owner);
alter table public.push_subscriptions enable row level security;
create policy "Lire ses abonnements aux notifications" on public.push_subscriptions
  for select to authenticated using (owner = (select auth.uid()));
create policy "Retirer ses abonnements aux notifications" on public.push_subscriptions
  for delete to authenticated using (owner = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Le même navigateur peut changer de compte : son adresse passe au compte connecté.
create function public.enregistrer_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (owner, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update
      set owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- Serveur seulement. Choisit les rappels de l'heure et les marque envoyés, en une fois : un même
-- jour ne reçoit jamais deux rappels, même si l'envoi est relancé.
create function public.rappels_a_envoyer(p_maintenant timestamptz default now())
returns table (owner uuid, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour date := (p_maintenant at time zone 'Europe/Paris')::date;
  v_heure time := (p_maintenant at time zone 'Europe/Paris')::time;
begin
  return query
  with dus as (
    update public.profiles p set rappel_envoye = v_jour
    where p.rappel is not null
      -- Une heure de marge pour un envoi en retard ; rappel <= 22 h, donc pas de passage à minuit.
      and v_heure >= p.rappel and v_heure < p.rappel + interval '1 hour'
      and p.rappel_envoye is distinct from v_jour
      and exists (select 1 from public.push_subscriptions s where s.owner = p.id)
      and not exists (
        select 1 from public.daily_stats d
        where d.owner = p.id and d.jour = v_jour
          and (d.reviser_fait or d.decouvrir_fait or d.defi_fait or d.mini_fait)
      )
    returning p.id
  )
  select s.owner, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s join dus on dus.id = s.owner;
end;
$$;

-- Toutes les 15 minutes, pg_cron appelle la fonction d'envoi. Son adresse et son secret viennent du
-- coffre (vault), propres à chaque environnement : sans eux, rien ne part.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.declencher_rappels()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'rappels_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'rappels_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('rappels', '*/15 * * * *', 'select public.declencher_rappels()');

revoke execute on function public.enregistrer_push(text, text, text) from public, anon;
grant execute on function public.enregistrer_push(text, text, text) to authenticated;
revoke execute on function public.rappels_a_envoyer(timestamptz) from public, anon, authenticated;
revoke execute on function public.declencher_rappels() from public, anon, authenticated;
