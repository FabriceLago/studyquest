-- Cours importés, notions, questions et réponses. Le navigateur lit ses cours et ses questions, mais
-- jamais les réponses (answer_keys) ; toute écriture sensible passe par des fonctions du serveur.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  titre text not null check (char_length(titre) between 1 and 120),
  format text not null check (format in ('pdf', 'photos', 'texte')),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'transcription', 'a_relire', 'generation', 'pret', 'echec')),
  raison text,
  texte text check (char_length(texte) <= 200000),
  cout_usd numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_owner_idx on public.courses (owner, created_at desc);

create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

create table public.notions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  titre text not null,
  ordre int not null,
  carte_recto text not null,
  carte_verso text not null
);
create index notions_course_idx on public.notions (course_id, ordre);
create index notions_owner_idx on public.notions (owner);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid not null references public.notions (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('unique', 'multiple', 'vrai_faux', 'association', 'classement')),
  enonce text not null,
  extrait text not null,
  difficulte text not null check (difficulte in ('facile', 'moyen', 'difficile')),
  -- Options ou éléments mélangés, sans aucune indication de la bonne réponse.
  presentation jsonb not null,
  ordre int not null
);
create index questions_notion_idx on public.questions (notion_id, ordre);
create index questions_owner_idx on public.questions (owner);

create table public.answer_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  reponse jsonb not null,
  explication text not null
);

-- Le compteur survit à la suppression d'un cours : supprimer ne redonne pas de quota.
create table public.import_usage (
  owner uuid not null references auth.users (id) on delete cascade,
  mois date not null,
  pretes int not null default 0,
  tentatives int not null default 0,
  primary key (owner, mois)
);

alter table public.courses enable row level security;
alter table public.notions enable row level security;
alter table public.questions enable row level security;
alter table public.answer_keys enable row level security;
alter table public.import_usage enable row level security;

create policy "Lire ses cours" on public.courses for select to authenticated using (owner = (select auth.uid()));
-- Un import en cours ne se supprime pas : ses fichiers et son coût sont encore en jeu.
create policy "Supprimer ses cours terminés" on public.courses for delete to authenticated
  using (owner = (select auth.uid()) and statut in ('a_relire', 'pret', 'echec'));
create policy "Lire ses notions" on public.notions for select to authenticated using (owner = (select auth.uid()));
create policy "Lire ses questions" on public.questions for select to authenticated using (owner = (select auth.uid()));
create policy "Supprimer ses questions" on public.questions for delete to authenticated using (owner = (select auth.uid()));
create policy "Lire son compteur" on public.import_usage for select to authenticated using (owner = (select auth.uid()));

revoke all on public.courses, public.notions, public.questions, public.answer_keys, public.import_usage from anon, authenticated;
grant select, delete on public.courses, public.questions to authenticated;
grant select on public.notions, public.import_usage to authenticated;

-- ponytail: quota provisoire. Le vrai chiffre sera fixé par le test des modèles (étape 1).
create function public.quota_imports_mensuel()
returns int language sql immutable set search_path = '' as $$ select 5 $$;

-- Crée le cours avant l'envoi des fichiers : un seul import à la fois, quota vérifié ici.
create function public.creer_import(p_titre text, p_format text, p_texte text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_mois date := date_trunc('month', now())::date;
  v_pretes int;
  v_tentatives int;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if (p_format = 'texte') <> (p_texte is not null) or char_length(p_texte) > 60000 then
    raise exception 'Texte invalide.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if exists (select 1 from public.courses where owner = v_user and statut in ('en_attente', 'transcription', 'generation')) then
    raise exception 'Un import est déjà en cours.' using errcode = 'SQ409';
  end if;
  select pretes, tentatives into v_pretes, v_tentatives from public.import_usage where owner = v_user and mois = v_mois;
  -- Les échecs ne consomment pas le quota, mais ils coûtent : leur nombre reste limité.
  if coalesce(v_pretes, 0) >= public.quota_imports_mensuel() or coalesce(v_tentatives, 0) >= 30 then
    raise exception 'Quota du mois atteint.' using errcode = 'SQ429';
  end if;
  insert into public.import_usage (owner, mois, tentatives) values (v_user, v_mois, 1)
    on conflict (owner, mois) do update set tentatives = public.import_usage.tentatives + 1;
  insert into public.courses (owner, titre, format, texte)
    values (v_user, btrim(p_titre), p_format, p_texte)
    returning id into v_id;
  return v_id;
end;
$$;

-- Texte transcrit depuis des photos : l'élève le corrige avant la génération.
create function public.corriger_transcription(p_id uuid, p_texte text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(p_texte)) not between 1 and 200000 then
    raise exception 'Texte invalide.' using errcode = '22023';
  end if;
  update public.courses set texte = p_texte
    where id = p_id and owner = auth.uid() and statut = 'a_relire';
  if not found then
    raise exception 'Ce cours n''attend pas de relecture.' using errcode = 'SQ409';
  end if;
end;
$$;

-- Serveur seulement. Fait avancer le statut d'un seul appel à la fois. Un import bloqué depuis
-- 10 minutes peut reprendre à son étape : une fonction peut s'arrêter à sa limite de durée.
create function public.demarrer_import(p_id uuid, p_owner uuid)
returns table (statut text, format text, texte text, cout_usd numeric)
language sql
security definer
set search_path = ''
as $$
  update public.courses c
  set statut = case
    when c.statut = 'en_attente' and c.format = 'texte' then 'generation'
    when c.statut = 'en_attente' then 'transcription'
    when c.statut = 'a_relire' then 'generation'
    else c.statut
  end
  where c.id = p_id
    and c.owner = p_owner
    and (
      c.statut in ('en_attente', 'a_relire')
      or (c.statut in ('transcription', 'generation') and c.updated_at < now() - interval '10 minutes')
    )
  returning c.statut, c.format, c.texte, c.cout_usd;
$$;

-- Serveur seulement. Tout ou rien : les questions, le statut et le décompte du quota ensemble.
create function public.enregistrer_generation(p_id uuid, p_notions jsonb, p_cout numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_statut text;
  v_notion uuid;
  v_question uuid;
  n jsonb;
  q jsonb;
begin
  select owner, statut into v_owner, v_statut from public.courses where id = p_id for update;
  if not found then
    raise exception 'Cours introuvable.' using errcode = 'P0002';
  end if;
  if v_statut = 'pret' then
    return;
  end if;
  delete from public.notions where course_id = p_id;
  for n in select * from jsonb_array_elements(p_notions) loop
    insert into public.notions (course_id, owner, titre, ordre, carte_recto, carte_verso)
      values (p_id, v_owner, n ->> 'titre', (n ->> 'ordre')::int, n ->> 'carte_recto', n ->> 'carte_verso')
      returning id into v_notion;
    for q in select * from jsonb_array_elements(n -> 'questions') loop
      insert into public.questions (notion_id, owner, type, enonce, extrait, difficulte, presentation, ordre)
        values (v_notion, v_owner, q ->> 'type', q ->> 'enonce', q ->> 'extrait', q ->> 'difficulte', q -> 'presentation', (q ->> 'ordre')::int)
        returning id into v_question;
      insert into public.answer_keys (question_id, reponse, explication)
        values (v_question, q -> 'reponse', q ->> 'explication');
    end loop;
  end loop;
  update public.courses set statut = 'pret', raison = null, cout_usd = p_cout where id = p_id;
  insert into public.import_usage (owner, mois, pretes) values (v_owner, date_trunc('month', now())::date, 1)
    on conflict (owner, mois) do update set pretes = public.import_usage.pretes + 1;
end;
$$;

revoke execute on function public.quota_imports_mensuel() from public, anon;
revoke execute on function public.creer_import(text, text, text) from public, anon;
revoke execute on function public.corriger_transcription(uuid, text) from public, anon;
revoke execute on function public.demarrer_import(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.enregistrer_generation(uuid, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.quota_imports_mensuel() to authenticated;
grant execute on function public.creer_import(text, text, text) to authenticated;
grant execute on function public.corriger_transcription(uuid, text) to authenticated;
grant execute on function public.demarrer_import(uuid, uuid) to service_role;
grant execute on function public.enregistrer_generation(uuid, jsonb, numeric) to service_role;

-- Fichiers en cours d'import, privés : <compte>/<cours>/<n>.<ext>. Supprimés après la transcription.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imports', 'imports', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

create policy "Déposer ses fichiers d'import" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Lire ses fichiers d'import" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Supprimer ses fichiers d'import" on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (select auth.uid()::text));
