-- Retour de la notion la plus faible après un examen blanc, et duels en différé.

-- Après un examen blanc, remet dans les révisions du jour les questions ratées de la notion la plus
-- faible. Seules celles déjà découvertes reviennent : une question neuve vaudrait 10 XP au lieu de 5.
create function public.reviser_notion_faible(p_examen uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_examen public.examens_blancs;
  v_notion uuid;
  v_titre text;
  v_ratees uuid[];
  v_nombre int;
begin
  select * into v_examen from public.examens_blancs where id = p_examen and owner = v_user;
  if not found or v_examen.score is null then
    raise exception 'Examen introuvable.' using errcode = 'SQ404';
  end if;
  select n.id, n.titre into v_notion, v_titre
    from unnest(v_examen.questions) i (id)
    join public.questions q on q.id = i.id
    join public.answer_keys k on k.question_id = q.id
    join public.notions n on n.id = q.notion_id
    group by n.id, n.titre, n.ordre
    having bool_or(not public.reponse_juste(q.type, k.reponse, v_examen.reponses -> q.id::text))
    order by count(*) filter (where public.reponse_juste(q.type, k.reponse, v_examen.reponses -> q.id::text))::numeric / count(*), n.ordre
    limit 1;
  if v_notion is null then
    return jsonb_build_object('notion', null, 'questions', 0);
  end if;
  v_ratees := array(
    select q.id from unnest(v_examen.questions) i (id)
    join public.questions q on q.id = i.id
    join public.answer_keys k on k.question_id = q.id
    where q.notion_id = v_notion and not public.reponse_juste(q.type, k.reponse, v_examen.reponses -> q.id::text)
  );
  update public.reviews set echeance = v_jour
    where owner = v_user and question_id = any (v_ratees) and echeance > v_jour;
  select count(*) into v_nombre from public.reviews
    where owner = v_user and question_id = any (v_ratees) and echeance <= v_jour;
  return jsonb_build_object('notion', v_titre, 'questions', v_nombre);
end;
$$;

-- Duel en différé : mêmes questions, chacun joue quand il veut. Les questions restent celles du cours
-- d'origine, et seules les personnes qui ont déjà reçu ce cours peuvent jouer.
create table public.duels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  course_id uuid not null references public.courses (id) on delete cascade,
  createur uuid not null references auth.users (id) on delete cascade,
  questions uuid[] not null,
  created_at timestamptz not null default now()
);
create index duels_createur_idx on public.duels (createur, created_at desc);
create index duels_course_idx on public.duels (course_id);

create table public.duel_parties (
  duel_id uuid not null references public.duels (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  reponses jsonb not null default '{}',
  debut timestamptz not null default now(),
  fin timestamptz not null,
  termine_at timestamptz,
  justes int,
  primary key (duel_id, owner)
);
create index duel_parties_owner_idx on public.duel_parties (owner);

alter table public.duels enable row level security;
alter table public.duel_parties enable row level security;
revoke all on public.duels, public.duel_parties from anon, authenticated;

create function public.detient_cours(p_owner uuid, p_source uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.courses
    where owner = p_owner and statut = 'pret' and (id = p_source or partage_de = p_source)
  )
$$;

create function public.creer_duel(p_cours uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_regles record;
  v_cours public.courses;
  v_source uuid;
  v_questions uuid[];
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_regles from public.regles();
  select * into v_cours from public.courses where id = p_cours and owner = v_user and statut = 'pret';
  if not found then
    raise exception 'Cours introuvable.' using errcode = 'SQ404';
  end if;
  -- Un duel n'ouvre aucun nouvel accès : le cours doit déjà être partagé.
  if v_cours.partage_de is null and v_cours.code_partage is null then
    raise exception 'Partage d''abord ce cours.' using errcode = 'SQ409';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 5));
  -- Le score total ne doit pas servir à deviner les réponses en multipliant les duels.
  if (select count(*) from public.duels where createur = v_user and created_at > now() - interval '1 day') >= v_regles.duels_par_jour then
    raise exception 'Nombre de duels du jour atteint.' using errcode = 'SQ429';
  end if;
  v_source := coalesce(v_cours.partage_de, v_cours.id);
  v_questions := array(
    select q.id from public.questions q
    join public.notions n on n.id = q.notion_id
    where n.course_id = v_source
    order by random()
    limit v_regles.duel_questions
  );
  if cardinality(v_questions) = 0 then
    raise exception 'Ce cours n''a plus de questions.' using errcode = 'SQ409';
  end if;
  insert into public.duels (code, course_id, createur, questions)
    values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)), v_source, v_user, v_questions)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.rejoindre_duel(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_duel public.duels;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_duel from public.duels where code = upper(btrim(p_code));
  if not found then
    raise exception 'Code inconnu.' using errcode = 'SQ404';
  end if;
  if not public.detient_cours(v_user, v_duel.course_id) then
    raise exception 'Il faut d''abord recevoir ce cours.' using errcode = 'SQ403';
  end if;
  return v_duel.id;
end;
$$;

-- Le score et le classement. Une question laissée sans réponse compte comme fausse.
create function public.terminer_duel(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_duel public.duels;
  v_partie public.duel_parties;
begin
  select * into v_duel from public.duels where id = p_duel;
  select * into v_partie from public.duel_parties where duel_id = p_duel and owner = v_user for update;
  if not found then
    raise exception 'Partie introuvable.' using errcode = 'SQ404';
  end if;
  if v_partie.justes is null then
    update public.duel_parties set
      termine_at = least(now(), v_partie.fin),
      justes = (
        select count(*) filter (where public.reponse_juste(q.type, k.reponse, v_partie.reponses -> q.id::text))
        from unnest(v_duel.questions) i (id)
        join public.questions q on q.id = i.id
        join public.answer_keys k on k.question_id = q.id
      )
    where duel_id = p_duel and owner = v_user;
  end if;
  return jsonb_build_object(
    'id', v_duel.id,
    'code', v_duel.code,
    'total', cardinality(v_duel.questions),
    'classement', (
      select coalesce(jsonb_agg(
        jsonb_build_object('pseudo', pr.pseudo, 'justes', p.justes, 'moi', p.owner = v_user)
        order by p.justes desc, p.termine_at - p.debut, p.owner
      ), '[]')
      from public.duel_parties p
      join public.profiles pr on pr.id = p.owner
      where p.duel_id = p_duel and p.justes is not null
    )
  );
end;
$$;

-- Démarre la partie de cet élève ou la reprend. Le chrono est gardé côté serveur.
create function public.jouer_duel(p_duel uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_regles record;
  v_duel public.duels;
  v_partie public.duel_parties;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_regles from public.regles();
  select * into v_duel from public.duels where id = p_duel for update;
  if not found then
    raise exception 'Duel introuvable.' using errcode = 'SQ404';
  end if;
  if not public.detient_cours(v_user, v_duel.course_id) then
    raise exception 'Il faut d''abord recevoir ce cours.' using errcode = 'SQ403';
  end if;
  select * into v_partie from public.duel_parties where duel_id = p_duel and owner = v_user;
  if not found then
    if (select count(*) from public.duel_parties where duel_id = p_duel) >= v_regles.partage_max then
      raise exception 'Ce duel a atteint son nombre de personnes.' using errcode = 'SQ429';
    end if;
    insert into public.duel_parties (duel_id, owner, fin)
      values (p_duel, v_user, now() + make_interval(secs => cardinality(v_duel.questions) * v_regles.duel_secondes_par_question))
      returning * into v_partie;
  end if;
  if v_partie.justes is not null or now() >= v_partie.fin then
    return public.terminer_duel(p_duel);
  end if;
  return jsonb_build_object(
    'id', v_duel.id,
    'code', v_duel.code,
    'total', cardinality(v_duel.questions),
    'questions', public.vues_questions(array(
      select i.id from unnest(v_duel.questions) with ordinality i (id, rang)
      where not v_partie.reponses ? i.id::text
      order by i.rang
    )),
    'secondes', ceil(extract(epoch from v_partie.fin - now()))::int
  );
end;
$$;

-- Garde la réponse sans rien dire de sa justesse : tout se corrige à la fin.
create function public.repondre_duel(p_duel uuid, p_question uuid, p_reponse jsonb)
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
  update public.duel_parties
    set reponses = reponses || jsonb_build_object(p_question::text, p_reponse)
    where duel_id = p_duel and owner = auth.uid() and justes is null
      and p_question = any ((select questions from public.duels where id = p_duel)::uuid[])
      and now() <= fin + make_interval(secs => v_regles.defi_marge_secondes);
  return found;
end;
$$;

-- Les duels récents de l'élève, pour retrouver le classement quand un ami a joué.
create function public.mes_duels()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'titre', x.titre, 'justes', x.justes, 'total', x.total, 'joueurs', x.joueurs
  ) order by x.created_at desc), '[]')
  from (
    select d.id, c.titre, d.created_at, p.justes, cardinality(d.questions) as total,
      (select count(*) from public.duel_parties a where a.duel_id = d.id and a.justes is not null) as joueurs
    from public.duel_parties p
    join public.duels d on d.id = p.duel_id
    join public.courses c on c.id = d.course_id
    where p.owner = auth.uid()
    order by d.created_at desc
    limit 5
  ) x
$$;

revoke execute on function public.reviser_notion_faible(uuid) from public, anon;
revoke execute on function public.detient_cours(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.creer_duel(uuid) from public, anon;
revoke execute on function public.rejoindre_duel(text) from public, anon;
revoke execute on function public.terminer_duel(uuid) from public, anon;
revoke execute on function public.jouer_duel(uuid) from public, anon;
revoke execute on function public.repondre_duel(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.mes_duels() from public, anon;
grant execute on function public.reviser_notion_faible(uuid) to authenticated;
grant execute on function public.creer_duel(uuid) to authenticated;
grant execute on function public.rejoindre_duel(text) to authenticated;
grant execute on function public.terminer_duel(uuid) to authenticated;
grant execute on function public.jouer_duel(uuid) to authenticated;
grant execute on function public.repondre_duel(uuid, uuid, jsonb) to authenticated;
grant execute on function public.mes_duels() to authenticated;
