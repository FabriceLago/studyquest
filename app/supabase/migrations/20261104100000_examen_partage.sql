-- Examen blanc et partage d'un cours par code. Le navigateur n'accède aux examens que par des
-- fonctions : aucune ne lui donne une réponse avant qu'il ait répondu.

create table public.examens_blancs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  jour date not null,
  questions uuid[] not null,
  reponses jsonb not null default '{}',
  fin timestamptz not null,
  score jsonb,
  -- Une fois par jour et par cours : le score par notion ne doit pas servir à deviner les réponses.
  unique (owner, course_id, jour)
);
create index examens_blancs_course_idx on public.examens_blancs (course_id);

alter table public.courses
  add column code_partage text unique,
  add column partage_declare_at timestamptz,
  add column partage_de uuid references public.courses (id) on delete set null;
create unique index courses_copie_idx on public.courses (owner, partage_de);
create index courses_partage_de_idx on public.courses (partage_de);

alter table public.examens_blancs enable row level security;
revoke all on public.examens_blancs from anon, authenticated;

-- Le score par notion : une question laissée sans réponse compte comme fausse.
create function public.rendre_examen(p_examen uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_examen public.examens_blancs;
  v_notions jsonb;
begin
  select * into v_examen from public.examens_blancs where id = p_examen and owner = auth.uid() for update;
  if not found then
    raise exception 'Examen introuvable.' using errcode = 'SQ404';
  end if;
  if v_examen.score is not null then
    return v_examen.score;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('titre', x.titre, 'justes', x.justes, 'total', x.total) order by x.ordre), '[]')
    into v_notions
    from (
      select n.titre, n.ordre, count(*)::int as total,
        count(*) filter (where public.reponse_juste(q.type, k.reponse, v_examen.reponses -> q.id::text))::int as justes
      from unnest(v_examen.questions) i (id)
      join public.questions q on q.id = i.id
      join public.answer_keys k on k.question_id = q.id
      join public.notions n on n.id = q.notion_id
      group by n.id, n.titre, n.ordre
    ) x;
  v_examen.score := jsonb_build_object(
    'justes', (select coalesce(sum((e ->> 'justes')::int), 0) from jsonb_array_elements(v_notions) e),
    'total', (select coalesce(sum((e ->> 'total')::int), 0) from jsonb_array_elements(v_notions) e),
    'notions', v_notions
  );
  update public.examens_blancs set score = v_examen.score where id = p_examen;
  return v_examen.score;
end;
$$;

-- Démarre l'examen du jour ou le reprend là où il en était. Le chrono est gardé côté serveur.
create function public.demarrer_examen(p_cours uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_regles record;
  v_examen public.examens_blancs;
  v_questions uuid[];
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.courses where id = p_cours and owner = v_user and statut = 'pret') then
    raise exception 'Cours introuvable.' using errcode = 'SQ404';
  end if;
  select * into v_regles from public.regles();
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 2));
  select * into v_examen from public.examens_blancs where owner = v_user and course_id = p_cours and jour = v_jour;
  if not found then
    -- ponytail: tirage au hasard sur tout le cours. Équilibrer par notion si les scores le demandent.
    v_questions := array(
      select q.id from public.questions q
      join public.notions n on n.id = q.notion_id
      where n.course_id = p_cours
      order by random()
      limit v_regles.examen_blanc_questions
    );
    if cardinality(v_questions) = 0 then
      raise exception 'Ce cours n''a plus de questions.' using errcode = 'SQ409';
    end if;
    insert into public.examens_blancs (owner, course_id, jour, questions, fin)
      values (v_user, p_cours, v_jour, v_questions,
        now() + make_interval(secs => cardinality(v_questions) * v_regles.examen_blanc_secondes_par_question))
      returning * into v_examen;
  end if;
  if v_examen.score is not null or now() >= v_examen.fin then
    return jsonb_build_object('id', v_examen.id, 'score', public.rendre_examen(v_examen.id));
  end if;
  return jsonb_build_object(
    'id', v_examen.id,
    'total', cardinality(v_examen.questions),
    'questions', public.vues_questions(array(
      select i.id from unnest(v_examen.questions) with ordinality i (id, rang)
      where not v_examen.reponses ? i.id::text
      order by i.rang
    )),
    'secondes', ceil(extract(epoch from v_examen.fin - now()))::int
  );
end;
$$;

-- Garde la réponse sans rien dire de sa justesse : tout se corrige à la fin.
create function public.repondre_examen(p_examen uuid, p_question uuid, p_reponse jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regles record;
begin
  if pg_column_size(p_reponse) > 2000 then
    raise exception 'Réponse trop longue.' using errcode = '22023';
  end if;
  select * into v_regles from public.regles();
  update public.examens_blancs
    set reponses = reponses || jsonb_build_object(p_question::text, p_reponse)
    where id = p_examen and owner = auth.uid() and score is null
      and p_question = any (questions)
      and now() <= fin + make_interval(secs => v_regles.defi_marge_secondes);
  return found;
end;
$$;

-- Le code ne se donne qu'après la déclaration du droit de partager : elle reste enregistrée.
create function public.partager_cours(p_cours uuid, p_droit boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cours public.courses;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if p_droit is not true then
    raise exception 'Le droit de partager doit être déclaré.' using errcode = '22023';
  end if;
  select * into v_cours from public.courses where id = p_cours and owner = v_user and statut = 'pret' for update;
  if not found then
    raise exception 'Cours introuvable.' using errcode = 'SQ404';
  end if;
  if v_cours.partage_de is not null then
    raise exception 'Une copie ne se repartage pas.' using errcode = 'SQ409';
  end if;
  if v_cours.code_partage is not null then
    return v_cours.code_partage;
  end if;
  -- 48 bits aléatoires, impossibles à deviner en essayant, et sans caractère ambigu à recopier.
  v_cours.code_partage := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  update public.courses set code_partage = v_cours.code_partage, partage_declare_at = now() where id = p_cours;
  return v_cours.code_partage;
end;
$$;

-- Les copies déjà reçues restent à leurs élèves : arrêter empêche seulement les nouvelles.
create function public.arreter_partage(p_cours uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.courses set code_partage = null where id = p_cours and owner = auth.uid();
$$;

-- Une copie complète pour l'élève : ses boîtes et ses retraits de questions lui restent propres.
create function public.rejoindre_cours(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_regles record;
  v_source public.courses;
  v_copie uuid;
  v_notion public.notions;
  v_nouvelle_notion uuid;
  v_question public.questions;
  v_nouvelle_question uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_regles from public.regles();
  select * into v_source from public.courses where code_partage = upper(btrim(p_code)) and statut = 'pret' for update;
  if not found then
    raise exception 'Code inconnu.' using errcode = 'SQ404';
  end if;
  if v_source.owner = v_user then
    raise exception 'Ce cours est déjà le tien.' using errcode = 'SQ409';
  end if;
  select id into v_copie from public.courses where owner = v_user and partage_de = v_source.id;
  if found then
    return v_copie;
  end if;
  if (select count(*) from public.courses where partage_de = v_source.id) >= v_regles.partage_max then
    raise exception 'Ce code a atteint son nombre de personnes.' using errcode = 'SQ429';
  end if;
  insert into public.courses (owner, titre, format, statut, partage_de)
    values (v_user, v_source.titre, v_source.format, 'pret', v_source.id)
    returning id into v_copie;
  for v_notion in select * from public.notions where course_id = v_source.id loop
    insert into public.notions (course_id, owner, titre, ordre, carte_recto, carte_verso)
      values (v_copie, v_user, v_notion.titre, v_notion.ordre, v_notion.carte_recto, v_notion.carte_verso)
      returning id into v_nouvelle_notion;
    for v_question in select * from public.questions where notion_id = v_notion.id loop
      insert into public.questions (notion_id, owner, type, enonce, extrait, difficulte, presentation, ordre)
        values (v_nouvelle_notion, v_user, v_question.type, v_question.enonce, v_question.extrait, v_question.difficulte, v_question.presentation, v_question.ordre)
        returning id into v_nouvelle_question;
      insert into public.answer_keys (question_id, reponse, explication)
        select v_nouvelle_question, reponse, explication from public.answer_keys where question_id = v_question.id;
    end loop;
  end loop;
  return v_copie;
end;
$$;

revoke execute on function public.rendre_examen(uuid) from public, anon;
revoke execute on function public.demarrer_examen(uuid) from public, anon;
revoke execute on function public.repondre_examen(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.partager_cours(uuid, boolean) from public, anon;
revoke execute on function public.arreter_partage(uuid) from public, anon;
revoke execute on function public.rejoindre_cours(text) from public, anon;
grant execute on function public.rendre_examen(uuid) to authenticated;
grant execute on function public.demarrer_examen(uuid) to authenticated;
grant execute on function public.repondre_examen(uuid, uuid, jsonb) to authenticated;
grant execute on function public.partager_cours(uuid, boolean) to authenticated;
grant execute on function public.arreter_partage(uuid) to authenticated;
grant execute on function public.rejoindre_cours(text) to authenticated;
