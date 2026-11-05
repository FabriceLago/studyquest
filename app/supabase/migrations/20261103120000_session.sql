-- Révision espacée, tentatives, XP et missions. Le navigateur lit ses compteurs mais n'écrit rien :
-- la correction, la révision et l'XP passent toutes par submit_answer, côté serveur.

-- Valeurs de départ du § 3 de la spécification : à régler ici, et nulle part ailleurs.
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
  out duels_par_jour int
)
language sql
immutable
set search_path = ''
as $$ select 15, 8, 5, 60, 5, 10, 5, 2, 20, 300, 2, array[1, 3, 7, 14, 30], 3, 20, 60, 50, 10, 30, 3 $$;

alter table public.courses add column date_examen date;

create table public.reviews (
  owner uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  boite smallint not null check (boite between 1 and 5),
  -- Une date et non une heure : « demain » reste demain, quelle que soit l'heure de la révision.
  echeance date not null,
  primary key (owner, question_id)
);
create index reviews_echeance_idx on public.reviews (owner, echeance);
create index reviews_question_idx on public.reviews (question_id);

-- Uniquement les réponses qui comptent. Celles qui n'apportent rien ne sont pas conservées.
create table public.attempts (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  -- Une question retirée garde son historique : il sert à mesurer la rétention.
  question_id uuid references public.questions (id) on delete set null,
  mission text not null check (mission in ('reviser', 'decouvrir', 'defi')),
  juste boolean not null,
  xp int not null,
  jour date not null,
  created_at timestamptz not null default now()
);
create index attempts_owner_jour_idx on public.attempts (owner, jour, mission);
create index attempts_question_idx on public.attempts (question_id);

create table public.daily_stats (
  owner uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  xp int not null default 0 check (xp >= 0),
  reviser_fait boolean not null default false,
  decouvrir_fait boolean not null default false,
  defi_fait boolean not null default false,
  -- Quelques réponses suffisent à garder la série les jours sans temps : voir regles().mini_questions.
  mini_fait boolean not null default false,
  defi_debut timestamptz,
  primary key (owner, jour)
);

alter table public.reviews enable row level security;
alter table public.attempts enable row level security;
alter table public.daily_stats enable row level security;
create policy "Lire ses révisions" on public.reviews for select to authenticated using (owner = (select auth.uid()));
create policy "Lire ses tentatives" on public.attempts for select to authenticated using (owner = (select auth.uid()));
create policy "Lire ses compteurs" on public.daily_stats for select to authenticated using (owner = (select auth.uid()));
revoke all on public.reviews, public.attempts, public.daily_stats from anon, authenticated;
grant select on public.reviews, public.attempts, public.daily_stats to authenticated;

-- ponytail: même fuseau pour tous (spécification § 3). Par compte si d'autres fuseaux arrivent.
create function public.jour_paris()
returns date language sql stable set search_path = '' as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- À l'approche d'un examen, une question revient au plus tard à la moitié du temps restant.
create function public.prochaine_echeance(p_jour date, p_intervalle int, p_examen date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_jour + case
    when p_examen > p_jour then least(p_intervalle, greatest((p_examen - p_jour) / 2, 1))
    else p_intervalle
  end
$$;

create function public.reponse_juste(p_type text, p_cle jsonb, p_reponse jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_attendu jsonb;
  v_donne jsonb;
begin
  if p_type = 'association' then
    return coalesce(p_reponse -> 'associations' = p_cle -> 'associations', false);
  elsif p_type = 'classement' then
    return coalesce(p_reponse -> 'ordre' = p_cle -> 'ordre', false);
  end if;
  if jsonb_typeof(p_reponse -> 'choisies') is distinct from 'array' then
    return false;
  end if;
  -- L'ordre des cases cochées n'a pas d'importance.
  select coalesce(jsonb_agg(v order by v), '[]') into v_attendu from jsonb_array_elements(p_cle -> 'correctes') v;
  select coalesce(jsonb_agg(v order by v), '[]') into v_donne from jsonb_array_elements(p_reponse -> 'choisies') v;
  return v_attendu = v_donne;
end;
$$;

-- Jours consécutifs avec une mission ou une mini-mission terminée. Les gels du mois comblent les
-- trous, et un gel n'est consommé que s'il relie vraiment deux jours actifs.
create function public.serie_et_gels(p_owner uuid, p_aujourdhui date default public.jour_paris())
returns table (serie int, gels int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gels int := (select gels_par_mois from public.regles());
  v_actifs date[];
  v_jour date := p_aujourdhui;
  v_premier date;
  v_serie int := 0;
  v_utilises date[] := '{}';
  v_trou date[] := '{}';
begin
  select array_agg(d.jour), min(d.jour) into v_actifs, v_premier from public.daily_stats d
    where d.owner = p_owner and d.jour <= p_aujourdhui
      and (d.reviser_fait or d.decouvrir_fait or d.defi_fait or d.mini_fait);
  if v_actifs is null then
    return query select 0, v_gels;
    return;
  end if;
  -- Une journée pas encore jouée ne casse pas la série.
  if not p_aujourdhui = any (v_actifs) then
    v_jour := p_aujourdhui - 1;
  end if;
  while v_jour >= v_premier loop
    if v_jour = any (v_actifs) then
      v_serie := v_serie + 1;
      v_utilises := v_utilises || v_trou;
      v_trou := '{}';
    else
      exit when (
        select count(*) from unnest(v_utilises || v_trou) m
        where date_trunc('month', m) = date_trunc('month', v_jour)
      ) >= v_gels;
      v_trou := v_trou || v_jour;
    end if;
    v_jour := v_jour - 1;
  end loop;
  return query select v_serie, v_gels - (
    select count(*)::int from unnest(v_utilises) m where date_trunc('month', m) = date_trunc('month', p_aujourdhui)
  );
end;
$$;

create function public.mission_du_jour()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_regles record;
  v_stats public.daily_stats;
  v_dues int;
  v_nouvelles int;
  v_vues int;
  v_revisees int;
  v_decouvertes int;
  v_defi_repondu boolean;
  v_maitrisees int;
  v_serie int;
  v_gels int;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_regles from public.regles();
  select * into v_stats from public.daily_stats where owner = v_user and jour = v_jour;
  select count(*), count(*) filter (where echeance <= v_jour) into v_vues, v_dues from public.reviews where owner = v_user;
  select count(*) into v_nouvelles from public.questions q
    where q.owner = v_user and not exists (select 1 from public.reviews r where r.owner = v_user and r.question_id = q.id);
  select count(*) filter (where mission = 'reviser'), count(*) filter (where mission = 'decouvrir'), count(*) filter (where mission = 'defi') > 0
    into v_revisees, v_decouvertes, v_defi_repondu from public.attempts where owner = v_user and jour = v_jour;
  -- Une notion est maîtrisée quand toutes ses questions sont en boîte 3 ou plus.
  select count(*) into v_maitrisees from public.notions n
    where n.owner = v_user
      and exists (select 1 from public.questions q where q.notion_id = n.id)
      and not exists (
        select 1 from public.questions q
        left join public.reviews r on r.owner = v_user and r.question_id = q.id
        where q.notion_id = n.id and coalesce(r.boite, 0) < 3
      );
  select s.serie, s.gels into v_serie, v_gels from public.serie_et_gels(v_user) s;
  return jsonb_build_object(
    'reviser', jsonb_build_object(
      'questions', least(v_dues, greatest(v_regles.reviser_max - v_revisees, 0)),
      'fait', coalesce(v_stats.reviser_fait, false)
    ),
    'decouvrir', jsonb_build_object(
      'questions', least(v_nouvelles, greatest(v_regles.decouvrir_max - v_decouvertes, 0)),
      'fait', coalesce(v_stats.decouvrir_fait, false)
    ),
    'defi', jsonb_build_object(
      -- Un essai passé sans aucune réponse est perdu : le défi revient le lendemain.
      'disponible', v_vues >= v_regles.defi_min_vues and (
        v_stats.defi_debut is null or v_defi_repondu
        or now() <= v_stats.defi_debut + make_interval(secs => v_regles.defi_secondes)
      ),
      'fait', coalesce(v_stats.defi_fait, false)
    ),
    'jour_compte', coalesce(v_stats.reviser_fait or v_stats.decouvrir_fait or v_stats.defi_fait or v_stats.mini_fait, false),
    'mini_questions', v_regles.mini_questions,
    'xp_jour', coalesce(v_stats.xp, 0),
    'plafond', v_regles.xp_plafond,
    'xp_mission', v_regles.xp_mission,
    'xp_total', (select coalesce(sum(xp), 0) from public.daily_stats where owner = v_user),
    'notions_maitrisees', v_maitrisees,
    'serie', v_serie,
    'gels', v_gels
  );
end;
$$;

-- Les questions telles que le navigateur les voit : sans réponse, sans explication, sans extrait.
create function public.vues_questions(p_ids uuid[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'type', q.type, 'enonce', q.enonce, 'presentation', q.presentation, 'notion', n.titre, 'cours', c.titre
  ) order by i.rang), '[]')
  from unnest(p_ids) with ordinality i (id, rang)
  join public.questions q on q.id = i.id
  join public.notions n on n.id = q.notion_id
  join public.courses c on c.id = n.course_id
$$;

-- Le défi démarre ici son chrono, côté serveur : recharger la page ne le remet pas à zéro.
create function public.questions_mission(p_mission text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_regles record;
  v_debut timestamptz;
  v_fait boolean;
  v_faites int;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_regles from public.regles();
  select count(*) into v_faites from public.attempts where owner = v_user and jour = v_jour and mission = p_mission;
  if p_mission = 'reviser' then
    return jsonb_build_object('questions', public.vues_questions(array(
      select r.question_id from public.reviews r
      join public.questions q on q.id = r.question_id
      join public.notions n on n.id = q.notion_id
      join public.courses c on c.id = n.course_id
      where r.owner = v_user and r.echeance <= v_jour
      -- Un examen à venir passe avant la règle « les plus en retard d'abord ».
      order by c.date_examen >= v_jour desc nulls last, r.echeance, r.question_id
      limit greatest(v_regles.reviser_max - v_faites, 0)
    )));
  elsif p_mission = 'decouvrir' then
    return jsonb_build_object('questions', public.vues_questions(array(
      select q.id from public.questions q
      join public.notions n on n.id = q.notion_id
      join public.courses c on c.id = n.course_id
      where q.owner = v_user and not exists (select 1 from public.reviews r where r.owner = v_user and r.question_id = q.id)
      order by c.created_at, n.ordre, q.ordre
      limit greatest(v_regles.decouvrir_max - v_faites, 0)
    )));
  elsif p_mission = 'defi' then
    if (select count(*) from public.reviews where owner = v_user) < v_regles.defi_min_vues then
      raise exception 'Le défi demande des questions déjà vues.' using errcode = 'SQ409';
    end if;
    insert into public.daily_stats (owner, jour) values (v_user, v_jour) on conflict (owner, jour) do nothing;
    select defi_debut, defi_fait into v_debut, v_fait from public.daily_stats where owner = v_user and jour = v_jour for update;
    if v_debut is null then
      v_debut := now();
      update public.daily_stats set defi_debut = v_debut where owner = v_user and jour = v_jour;
    end if;
    -- Un seul essai par jour : une fois le temps écoulé ou le défi terminé, plus rien à jouer.
    if v_fait or now() >= v_debut + make_interval(secs => v_regles.defi_secondes) then
      return jsonb_build_object('questions', '[]'::jsonb, 'secondes', 0);
    end if;
    return jsonb_build_object(
      'questions', public.vues_questions(array(
        select r.question_id from public.reviews r
        where r.owner = v_user and not exists (
          select 1 from public.attempts a
          where a.owner = v_user and a.jour = v_jour and a.mission = 'defi' and a.question_id = r.question_id
        )
        order by random()
        limit 40
      )),
      'secondes', ceil(v_regles.defi_secondes - extract(epoch from now() - v_debut))::int
    );
  end if;
  raise exception 'Mission inconnue.' using errcode = '22023';
end;
$$;

-- Corrige, fait avancer la révision et attribue l'XP dans la limite du plafond quotidien.
-- Une réponse qui ne compte pas ne renvoie rien : ni la correction, ni même si elle était juste.
create function public.submit_answer(p_question uuid, p_mission text, p_reponse jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_regles record;
  v_type text;
  v_extrait text;
  v_cle jsonb;
  v_explication text;
  v_examen date;
  v_boite int;
  v_echeance date;
  v_stats public.daily_stats;
  v_faites int;
  v_compte boolean;
  v_juste boolean;
  v_xp int := 0;
  v_prime int := 0;
  v_mission_faite boolean := false;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if p_mission is null or p_mission not in ('reviser', 'decouvrir', 'defi') then
    raise exception 'Mission inconnue.' using errcode = '22023';
  end if;
  select q.type, q.extrait, k.reponse, k.explication, c.date_examen
    into v_type, v_extrait, v_cle, v_explication, v_examen
    from public.questions q
    join public.answer_keys k on k.question_id = q.id
    join public.notions n on n.id = q.notion_id
    join public.courses c on c.id = n.course_id
    where q.id = p_question and q.owner = v_user;
  if not found then
    raise exception 'Question introuvable.' using errcode = 'SQ404';
  end if;
  select * into v_regles from public.regles();

  -- Un seul calcul à la fois par compte : deux réponses simultanées ne dépassent pas le plafond.
  insert into public.daily_stats (owner, jour) values (v_user, v_jour) on conflict (owner, jour) do nothing;
  select * into v_stats from public.daily_stats where owner = v_user and jour = v_jour for update;
  select boite, echeance into v_boite, v_echeance from public.reviews where owner = v_user and question_id = p_question;
  select count(*) into v_faites from public.attempts where owner = v_user and jour = v_jour and mission = p_mission;

  if p_mission = 'reviser' then
    v_compte := v_boite is not null and v_echeance <= v_jour and v_faites < v_regles.reviser_max;
  elsif p_mission = 'decouvrir' then
    v_compte := v_boite is null and v_faites < v_regles.decouvrir_max;
  else
    v_compte := v_boite is not null and not v_stats.defi_fait and v_stats.defi_debut is not null
      -- La marge couvre le temps de trajet de la dernière réponse.
      and now() <= v_stats.defi_debut + make_interval(secs => v_regles.defi_secondes + v_regles.defi_marge_secondes)
      and not exists (
        select 1 from public.attempts
        where owner = v_user and jour = v_jour and mission = 'defi' and question_id = p_question
      );
  end if;
  if not v_compte then
    return jsonb_build_object('compte', false);
  end if;

  v_juste := public.reponse_juste(v_type, v_cle, p_reponse);
  if p_mission = 'reviser' then
    v_xp := case when v_juste then v_regles.xp_due else 0 end;
    v_boite := case when v_juste then least(v_boite + 1, cardinality(v_regles.intervalles)) else 1 end;
    update public.reviews set boite = v_boite, echeance = public.prochaine_echeance(v_jour, v_regles.intervalles[v_boite], v_examen)
      where owner = v_user and question_id = p_question;
    v_mission_faite := not v_stats.reviser_fait and (
      v_faites + 1 >= v_regles.reviser_max
      or not exists (select 1 from public.reviews where owner = v_user and echeance <= v_jour)
    );
  elsif p_mission = 'decouvrir' then
    v_xp := case when v_juste then v_regles.xp_nouvelle else 0 end;
    insert into public.reviews (owner, question_id, boite, echeance)
      values (v_user, p_question, 1, public.prochaine_echeance(v_jour, v_regles.intervalles[1], v_examen));
    v_mission_faite := not v_stats.decouvrir_fait and (
      v_faites + 1 >= v_regles.decouvrir_max
      or not exists (
        select 1 from public.questions q
        where q.owner = v_user and not exists (select 1 from public.reviews r where r.owner = v_user and r.question_id = q.id)
      )
    );
  else
    v_xp := case when v_juste then v_regles.xp_defi else 0 end;
  end if;

  v_xp := least(v_xp, v_regles.xp_plafond - v_stats.xp);
  if v_mission_faite then
    v_prime := least(v_regles.xp_mission, v_regles.xp_plafond - v_stats.xp - v_xp);
  end if;
  insert into public.attempts (owner, question_id, mission, juste, xp, jour)
    values (v_user, p_question, p_mission, v_juste, v_xp, v_jour);
  update public.daily_stats set
    xp = xp + v_xp + v_prime,
    reviser_fait = reviser_fait or (v_mission_faite and p_mission = 'reviser'),
    decouvrir_fait = decouvrir_fait or (v_mission_faite and p_mission = 'decouvrir'),
    mini_fait = mini_fait or (p_mission <> 'defi' and (
      select count(*) from public.attempts where owner = v_user and jour = v_jour and mission <> 'defi'
    ) >= v_regles.mini_questions)
  where owner = v_user and jour = v_jour;

  -- Le défi ne montre pas la correction : elle dévoilerait la réponse d'une question à réviser.
  if p_mission = 'defi' then
    return jsonb_build_object('compte', true, 'juste', v_juste, 'xp', v_xp);
  end if;
  return jsonb_build_object(
    'compte', true, 'juste', v_juste, 'xp', v_xp, 'prime', v_prime, 'mission_faite', v_mission_faite,
    'reponse', v_cle, 'explication', v_explication, 'extrait', v_extrait
  );
end;
$$;

-- Fin du défi : il faut avoir répondu à au moins une question, et la prime n'est donnée qu'une fois.
-- Le bilan vient d'ici pour rester juste après un rechargement de la page.
create function public.terminer_defi()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_regles record;
  v_stats public.daily_stats;
  v_justes int;
  v_total int;
  v_xp int;
  v_prime int := 0;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into v_regles from public.regles();
  select * into v_stats from public.daily_stats where owner = v_user and jour = v_jour for update;
  select count(*) filter (where juste), count(*), coalesce(sum(xp), 0) into v_justes, v_total, v_xp
    from public.attempts where owner = v_user and jour = v_jour and mission = 'defi';
  if not v_stats.defi_fait and v_total > 0 then
    v_prime := least(v_regles.xp_mission, v_regles.xp_plafond - v_stats.xp);
    update public.daily_stats set defi_fait = true, xp = xp + v_prime where owner = v_user and jour = v_jour;
  end if;
  return jsonb_build_object('prime', v_prime, 'justes', v_justes, 'total', v_total, 'xp', v_xp);
end;
$$;

-- Date d'examen d'un cours : les questions prévues trop tard reviennent aussitôt à la bonne distance.
create function public.fixer_examen(p_cours uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_jour date := public.jour_paris();
  v_regles record;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if p_date < v_jour or p_date > v_jour + 365 then
    raise exception 'Date d''examen invalide.' using errcode = '22023';
  end if;
  select * into v_regles from public.regles();
  update public.courses set date_examen = p_date where id = p_cours and owner = v_user and statut = 'pret';
  if not found then
    raise exception 'Cours introuvable.' using errcode = 'SQ404';
  end if;
  if p_date is null then
    return;
  end if;
  update public.reviews r
    set echeance = least(r.echeance, public.prochaine_echeance(v_jour, v_regles.intervalles[r.boite], p_date))
    from public.questions q
    join public.notions n on n.id = q.notion_id
    where q.id = r.question_id and n.course_id = p_cours and r.owner = v_user;
end;
$$;

-- Mesure principale de la spécification (§ 9) : part des inscrits revenus entre le 7e et le 13e jour.
-- Seuls comptent les comptes dont cette période est entièrement écoulée.
create function public.retention_j7()
returns table (inscrits int, revenus int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int, count(*) filter (where exists (
    select 1 from public.attempts a
    where a.owner = u.id and a.created_at >= u.created_at + interval '7 days' and a.created_at < u.created_at + interval '14 days'
  ))::int
  from auth.users u
  where u.created_at <= now() - interval '14 days';
$$;

revoke execute on function public.regles() from public, anon, authenticated;
revoke execute on function public.jour_paris() from public, anon, authenticated;
revoke execute on function public.prochaine_echeance(date, int, date) from public, anon, authenticated;
revoke execute on function public.fixer_examen(uuid, date) from public, anon;
grant execute on function public.fixer_examen(uuid, date) to authenticated;
revoke execute on function public.reponse_juste(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.serie_et_gels(uuid, date) from public, anon, authenticated;
revoke execute on function public.vues_questions(uuid[]) from public, anon, authenticated;
revoke execute on function public.mission_du_jour() from public, anon;
revoke execute on function public.questions_mission(text) from public, anon;
revoke execute on function public.submit_answer(uuid, text, jsonb) from public, anon;
revoke execute on function public.terminer_defi() from public, anon;
revoke execute on function public.retention_j7() from public, anon, authenticated;
grant execute on function public.mission_du_jour() to authenticated;
grant execute on function public.questions_mission(text) to authenticated;
grant execute on function public.submit_answer(uuid, text, jsonb) to authenticated;
grant execute on function public.terminer_defi() to authenticated;
grant execute on function public.retention_j7() to service_role;
