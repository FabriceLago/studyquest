-- Un profil par compte, créé à l'inscription. La date de naissance n'est pas collectée : on garde
-- seulement le moment où la personne a déclaré avoir 15 ans ou plus.

-- Retire les droits par défaut que Supabase donne à anon et authenticated sur ce schéma. Attention :
-- cela ne retire pas le droit d'exécution de PUBLIC, global dans PostgreSQL. Chaque fonction doit
-- donc faire son propre « revoke execute ... from public », comme ci-dessous.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Sans caractère de contrôle ni d'inversion de sens : le pseudo s'affichera aux membres d'un groupe.
  pseudo text not null check (
    char_length(pseudo) between 1 and 30
    and pseudo = btrim(pseudo)
    and pseudo !~ E'[[:cntrl:]​-‏‪-‮⁠-⁩﻿]'
  ),
  declared_15_plus_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Lire son profil" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "Modifier son profil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Depuis le navigateur, seul le pseudo est modifiable. La création passe par le déclencheur, la
-- suppression par celle du compte.
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, trigger, references on public.profiles from authenticated;
grant update (pseudo) on public.profiles to authenticated;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- À l'inscription : la déclaration d'âge est exigée ici aussi, car le navigateur peut être contourné.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'declares_15_plus', '') <> 'true' then
    raise exception 'Déclaration d''âge requise.' using errcode = 'check_violation';
  end if;
  insert into public.profiles (id, pseudo, declared_15_plus_at)
  values (
    new.id,
    coalesce(
      nullif(
        btrim(left(regexp_replace(
          coalesce(new.raw_user_meta_data ->> 'pseudo', ''),
          E'[[:cntrl:]​-‏‪-‮⁠-⁩﻿]', '', 'g'
        ), 30)),
        ''
      ),
      'Joueur'
    ),
    now()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Droit à l'effacement : le compte connecté se supprime lui-même, le profil part avec lui.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
