-- Corrections de sécurité (08/11/2026), trouvées en attaquant la base locale avec deux sessions
-- anonymes. Trois points :
--   1. le marqueur de copie (partage_de) était effacé quand l'auteur supprimait le cours d'origine,
--      ce qui rendait les copies de nouveau partageables et modifiables ;
--   2. on pouvait déposer des fichiers dans le dépôt « imports » sans aucun import en cours ;
--   3. submit_answer ne bornait pas la taille de la réponse, contrairement aux duels et examens.

-- 1. partage_de reste un marqueur définitif : une copie le garde même si l'original est supprimé.
-- Les copies survivent à la suppression de leur source (choix de la spécification) sans jamais
-- redevenir des originaux. Rien ne lit la ligne d'origine à partir de partage_de ; l'index unique
-- (owner, partage_de) et l'index de comptage restent valides.
alter table public.courses drop constraint courses_partage_de_fkey;

-- 2. Un dépôt dans « imports » n'est permis que vers un cours que la personne possède et qui est
-- encore dans la chaîne d'import. Sans cela, n'importe quelle session remplissait le stockage gratuit.
drop policy "Déposer ses fichiers d'import" on storage.objects;
create policy "Déposer ses fichiers d'import" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1 from public.courses c
      where c.owner = (select auth.uid())
        and c.id::text = (storage.foldername(name))[2]
        and c.statut in ('en_attente', 'transcription', 'generation', 'a_relire')
    )
  );

-- 3. submit_answer borne la taille de la réponse, comme repondre_examen et repondre_duel. Le corps
-- est identique à la migration 20261103120000_session.sql, avec seulement ce garde ajouté.
create or replace function public.submit_answer(p_question uuid, p_mission text, p_reponse jsonb)
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
  -- Garde de taille : une réponse démesurée ne doit pas faire travailler le serveur pour rien.
  if pg_column_size(p_reponse) > 2000 then
    raise exception 'Réponse trop longue.' using errcode = '22023';
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
