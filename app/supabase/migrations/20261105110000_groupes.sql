-- Groupes et classement (spécification § 3) : un groupe par code d'invitation, 50 membres au plus.
-- Entre membres, on ne voit que le pseudo, l'XP de la semaine et la série. Repris des groupes de
-- Cyber Academy (20261029100000_groupes.sql), sans suivi de progression par un responsable.

-- Les valeurs chiffrées restent au même endroit : regles() reçoit celles des groupes et des avatars.
drop function public.regles();
create function public.regles(
  out reviser_max int,
  out decouvrir_max int,
  out defi_min_vues int,
  out defi_secondes int,
  out defi_marge_secondes int,
  out xp_due int,
  out xp_nouvelle int,
  out xp_defi int,
  out xp_mission int,
  out xp_plafond int,
  out gels_par_mois int,
  out intervalles int[],
  out mini_questions int,
  out examen_blanc_questions int,
  out examen_blanc_secondes_par_question int,
  out partage_max int,
  out duel_questions int,
  out duel_secondes_par_question int,
  out duels_par_jour int,
  out groupe_membres_max int,
  out groupes_par_compte int,
  -- Niveau requis pour chacun des 8 avatars, dans l'ordre de src/app/core/avatars.ts.
  out avatars_niveaux int[]
)
language sql
immutable
set search_path = ''
as $$ select 15, 8, 5, 60, 5, 10, 5, 2, 20, 300, 2, array[1, 3, 7, 14, 30], 3, 20, 60, 50, 10, 30, 3, 50, 10, array[1, 1, 1, 2, 3, 4, 5, 6] $$;
revoke execute on function public.regles() from public, anon, authenticated;

/* ---------- Avatars : décoratifs, débloqués par niveau, visibles par soi seulement ---------- */

alter table public.profiles add column avatar smallint not null default 0 check (avatar between 0 and 7);

create function public.choisir_avatar(p_avatar int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_requis int := ((public.regles()).avatars_niveaux)[p_avatar + 1];
  v_xp int;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if v_requis is null then
    raise exception 'Avatar inconnu.' using errcode = 'SQ404';
  end if;
  select coalesce(sum(xp), 0) into v_xp from public.daily_stats where owner = v_user;
  -- Même calcul que niveau() dans session.service.ts.
  if floor(sqrt(v_xp / 100.0)) + 1 < v_requis then
    raise exception 'Avatar pas encore débloqué.' using errcode = 'SQ403';
  end if;
  update public.profiles set avatar = p_avatar where id = v_user;
end;
$$;

/* ---------- Groupes ---------- */

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  -- Mêmes règles que le pseudo : le nom s'affiche à tous les membres.
  nom text not null check (
    char_length(nom) between 1 and 60
    and nom = btrim(nom)
    and nom !~ E'[[:cntrl:]​-‏‪-‮⁠-⁩﻿]'
  ),
  code text not null unique,
  created_at timestamptz not null default now()
);
create index groups_owner_idx on public.groups (owner);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- Le navigateur lit ses adhésions et le nom de ses groupes, rien d'autre : ni la personne qui a créé
-- le groupe, ni les autres membres. Le classement et toutes les écritures passent par les fonctions.
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
create policy "Lire ses adhésions" on public.group_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Lire ses groupes" on public.groups
  for select to authenticated
  using (id in (select group_id from public.group_members where user_id = (select auth.uid())));
revoke all on public.groups, public.group_members from anon, authenticated;
grant select (id, nom, created_at) on public.groups to authenticated;
grant select on public.group_members to authenticated;

-- 8 signes tirés au hasard (pgcrypto), sans 0/O ni 1/I : environ 10^12 codes possibles.
create function public.tirer_code_groupe()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(r.b, i) % 32 + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) as i;
$$;

-- La personne qui crée le groupe en devient membre.
create function public.creer_groupe(p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('groupes:' || v_user::text, 0));
  if (select count(*) from public.groups where owner = v_user) >= (public.regles()).groupes_par_compte then
    raise exception 'Nombre de groupes atteint.' using errcode = 'SQ429';
  end if;
  -- ponytail: une collision de code (1 chance sur 10^12) ferait échouer la création ; il suffit de réessayer.
  insert into public.groups (owner, nom, code)
    values (v_user, btrim(p_nom), public.tirer_code_groupe())
    returning id into v_id;
  insert into public.group_members (group_id, user_id) values (v_id, v_user);
  return v_id;
end;
$$;

-- Espaces, tirets et minuscules acceptés dans le code.
create function public.rejoindre_groupe(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_groupe uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select id into v_groupe from public.groups
    where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_groupe is null then
    raise exception 'Code inconnu.' using errcode = 'SQ404';
  end if;
  -- Une adhésion à la fois par groupe : le décompte voit celles des envois précédents.
  perform pg_advisory_xact_lock(hashtextextended('groupe:' || v_groupe::text, 0));
  if not exists (select 1 from public.group_members where group_id = v_groupe and user_id = v_user)
     and (select count(*) from public.group_members where group_id = v_groupe) >= (public.regles()).groupe_membres_max then
    raise exception 'Ce groupe est complet.' using errcode = 'SQ409';
  end if;
  insert into public.group_members (group_id, user_id) values (v_groupe, v_user) on conflict do nothing;
  return v_groupe;
end;
$$;

-- Le classement de la semaine, pour les membres seulement : pseudo, XP depuis lundi 0 h (heure de
-- Paris) et série. L'identifiant d'un membre n'est donné qu'à la personne qui a créé le groupe.
create function public.classement_groupe(p_groupe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_groupe public.groups;
  v_lundi date := date_trunc('week', public.jour_paris())::date;
begin
  select g.* into v_groupe from public.groups g
    join public.group_members m on m.group_id = g.id and m.user_id = v_user
    where g.id = p_groupe;
  if v_groupe.id is null then
    raise exception 'Groupe introuvable.' using errcode = 'SQ404';
  end if;
  return jsonb_build_object(
    'nom', v_groupe.nom,
    'code', v_groupe.code,
    'createur', v_groupe.owner = v_user,
    'membres', (
      select jsonb_agg(jsonb_build_object(
        'pseudo', l.pseudo,
        'xp', l.xp,
        'serie', l.serie,
        'moi', l.user_id = v_user,
        'id', case when v_groupe.owner = v_user then l.user_id end
      ) order by l.xp desc, l.serie desc, l.pseudo, l.user_id)
      from (
        select m.user_id, p.pseudo,
          (select coalesce(sum(d.xp), 0) from public.daily_stats d
            where d.owner = m.user_id and d.jour >= v_lundi)::int as xp,
          (select s.serie from public.serie_et_gels(m.user_id) s) as serie
        from public.group_members m
        join public.profiles p on p.id = m.user_id
        where m.group_id = p_groupe
      ) l
    )
  );
end;
$$;

-- Quitter un groupe. La personne qui l'a créé le supprime plutôt.
create function public.quitter_groupe(p_groupe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.groups where id = p_groupe and owner = auth.uid()) then
    raise exception 'Supprime le groupe pour le quitter.' using errcode = 'SQ409';
  end if;
  delete from public.group_members where group_id = p_groupe and user_id = auth.uid();
end;
$$;

-- Modération, réservée à la personne qui a créé le groupe : retirer un membre, changer le code
-- (l'ancien ne permet plus d'entrer), supprimer le groupe.
create function public.retirer_membre(p_groupe uuid, p_membre uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.groups where id = p_groupe and owner = auth.uid()) then
    raise exception 'Réservé à la personne qui a créé le groupe.' using errcode = '42501';
  end if;
  if p_membre = auth.uid() then
    raise exception 'Supprime le groupe pour le quitter.' using errcode = 'SQ409';
  end if;
  delete from public.group_members where group_id = p_groupe and user_id = p_membre;
end;
$$;

create function public.changer_code_groupe(p_groupe uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  update public.groups set code = public.tirer_code_groupe()
    where id = p_groupe and owner = auth.uid()
    returning code into v_code;
  if v_code is null then
    raise exception 'Réservé à la personne qui a créé le groupe.' using errcode = '42501';
  end if;
  return v_code;
end;
$$;

create function public.supprimer_groupe(p_groupe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.groups where id = p_groupe and owner = auth.uid();
  if not found then
    raise exception 'Réservé à la personne qui a créé le groupe.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.tirer_code_groupe() from public, anon, authenticated;
revoke execute on function public.choisir_avatar(int) from public, anon;
revoke execute on function public.creer_groupe(text) from public, anon;
revoke execute on function public.rejoindre_groupe(text) from public, anon;
revoke execute on function public.classement_groupe(uuid) from public, anon;
revoke execute on function public.quitter_groupe(uuid) from public, anon;
revoke execute on function public.retirer_membre(uuid, uuid) from public, anon;
revoke execute on function public.changer_code_groupe(uuid) from public, anon;
revoke execute on function public.supprimer_groupe(uuid) from public, anon;
grant execute on function public.choisir_avatar(int) to authenticated;
grant execute on function public.creer_groupe(text) to authenticated;
grant execute on function public.rejoindre_groupe(text) to authenticated;
grant execute on function public.classement_groupe(uuid) to authenticated;
grant execute on function public.quitter_groupe(uuid) to authenticated;
grant execute on function public.retirer_membre(uuid, uuid) to authenticated;
grant execute on function public.changer_code_groupe(uuid) to authenticated;
grant execute on function public.supprimer_groupe(uuid) to authenticated;
