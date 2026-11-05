begin;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"pseudo":"Ana","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"pseudo":"Ben","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test', '{"pseudo":"Cam","declares_15_plus":true}');
create function pg_temp.jour() returns date language sql as $$ select (now() at time zone 'Europe/Paris')::date $$;
grant execute on function pg_temp.jour() to authenticated;
create function pg_temp.moi(p_uuid text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s"}', p_uuid), true);
$$;
grant execute on function pg_temp.moi(text) to authenticated;
-- Sans RLS, pour désigner une question quel que soit le compte connecté.
create function pg_temp.q(p_enonce text) returns uuid language sql security definer as $$
  select id from public.questions where enonce = p_enonce and owner = '00000000-0000-0000-0000-00000000000a'
$$;
grant execute on function pg_temp.q(text) to authenticated;
create function pg_temp.notion(p_titre text, p_ordre int) returns jsonb language sql as $$
  select jsonb_build_object('titre', p_titre, 'ordre', p_ordre, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', (
    select jsonb_agg(jsonb_build_object('type', 'unique', 'enonce', p_titre || '-' || i, 'extrait', 'X', 'difficulte', 'facile', 'ordre', i, 'presentation', '{"options":["a","b"]}'::jsonb, 'reponse', '{"correctes":[0]}'::jsonb, 'explication', 'E'))
    from generate_series(1, 4) i
  ))
$$;

set local role anon;
select throws_ok($$select public.reviser_notion_faible(gen_random_uuid())$$, '42501', 'permission denied for function reviser_notion_faible', 'un visiteur ne relance pas de révision');
select throws_ok($$select public.creer_duel(gen_random_uuid())$$, '42501', 'permission denied for function creer_duel', 'un visiteur ne crée pas de duel');
select throws_ok($$select public.jouer_duel(gen_random_uuid())$$, '42501', 'permission denied for function jouer_duel', 'un visiteur ne joue pas de duel');

-- Notion la plus faible après un examen blanc
reset role;
insert into public.courses (id, owner, titre, format, statut) values
  ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-00000000000a', 'Cours', 'texte', 'generation');
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c0', jsonb_build_array(pg_temp.notion('N1', 0), pg_temp.notion('N2', 1), pg_temp.notion('N3', 2)), 0);
set local role authenticated;
select pg_temp.moi('00000000-0000-0000-0000-00000000000a');
select public.submit_answer(pg_temp.q('N1-1'), 'decouvrir', '{"choisies":[0]}');
select public.submit_answer(pg_temp.q('N3-1'), 'decouvrir', '{"choisies":[0]}');
create temp table examen on commit drop as select public.demarrer_examen('00000000-0000-0000-0000-0000000000c0') as e;
select throws_ok(format($$select public.reviser_notion_faible(%L)$$, (select e ->> 'id' from examen)), 'SQ404', null, 'pas de révision avant d''avoir rendu l''examen');
select public.repondre_examen((select (e ->> 'id')::uuid from examen), pg_temp.q('N3-' || i), case when i = 2 then '{"choisies":[1]}'::jsonb else '{"choisies":[0]}'::jsonb end)
  from generate_series(1, 4) i;
select public.rendre_examen((select (e ->> 'id')::uuid from examen));
create temp table faible on commit drop as select public.reviser_notion_faible((select (e ->> 'id')::uuid from examen)) as r;
select is((select r ->> 'notion' from faible), 'N1', 'la notion avec la plus faible part de bonnes réponses est choisie');
select is((select (r ->> 'questions')::int from faible), 1, 'seule la question ratée et déjà découverte revient');
select is((select count(*)::int from public.reviews where echeance <= pg_temp.jour()), 1, 'elle est due aujourd''hui');
select is((select count(*)::int from public.reviews), 2, 'une question jamais découverte ne devient pas une révision');
select is((select boite::int from public.reviews where echeance <= pg_temp.jour()), 1, 'sa boîte ne change pas');
select is(public.reviser_notion_faible((select (e ->> 'id')::uuid from examen)) ->> 'questions', '1', 'demander deux fois ne change rien');
select pg_temp.moi('00000000-0000-0000-0000-00000000000b');
select throws_ok(format($$select public.reviser_notion_faible(%L)$$, (select e ->> 'id' from examen)), 'SQ404', null, 'pas sur l''examen d''un autre compte');

-- Duels
select pg_temp.moi('00000000-0000-0000-0000-00000000000a');
reset role;
insert into public.courses (id, owner, titre, format, statut) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Partagé', 'texte', 'generation');
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c1', jsonb_build_array(
  jsonb_build_object('titre', 'N', 'ordre', 0, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', (
    select jsonb_agg(jsonb_build_object('type', 'unique', 'enonce', 'Q' || i, 'extrait', 'X' || i, 'difficulte', 'facile', 'ordre', i, 'presentation', '{"options":["a","b"]}'::jsonb, 'reponse', '{"correctes":[0]}'::jsonb, 'explication', 'E'))
    from generate_series(1, 12) i
  ))
), 0);
set local role authenticated;
select throws_ok($$select public.creer_duel('00000000-0000-0000-0000-0000000000c1')$$, 'SQ409', null, 'pas de duel sur un cours qui n''est pas partagé');
create temp table partage on commit drop as select public.partager_cours('00000000-0000-0000-0000-0000000000c1', true) as code;
create temp table duel on commit drop as select public.creer_duel('00000000-0000-0000-0000-0000000000c1') as id;
create temp table partie on commit drop as select public.jouer_duel((select id from duel)) as p;
select is((select jsonb_array_length(p -> 'questions') from partie), 10, 'un duel compte 10 questions');
select is((select (p ->> 'secondes')::int from partie), 300, '30 secondes par question');
select ok((select p::text !~ 'correctes|explication|extrait' from partie), 'un duel ne révèle aucune réponse');
create temp table cible on commit drop as select (p -> 'questions' -> 0 ->> 'id')::uuid as q1, (p -> 'questions' -> 1 ->> 'id')::uuid as q2, (p -> 'questions' -> 2 ->> 'id')::uuid as q3 from partie;
select is(public.repondre_duel((select id from duel), (select q1 from cible), '{"choisies":[0]}'), true, 'une réponse est gardée');
select is(public.repondre_duel((select id from duel), gen_random_uuid(), '{"choisies":[0]}'), false, 'une question hors du duel est refusée');
select is(jsonb_array_length(public.jouer_duel((select id from duel)) -> 'questions'), 9, 'une reprise ne repropose pas une question répondue');
select public.repondre_duel((select id from duel), (select q2 from cible), '{"choisies":[1]}');
select is(public.terminer_duel((select id from duel)) -> 'classement', '[{"moi": true, "justes": 1, "pseudo": "Ana"}]'::jsonb, 'le score ne compte que les bonnes réponses');
select is(public.repondre_duel((select id from duel), (select q3 from cible), '{"choisies":[0]}'), false, 'plus de réponse après la fin de la partie');
select is((public.jouer_duel((select id from duel)) -> 'classement' -> 0 ->> 'justes')::int, 1, 'rejouer ne change pas le score');

select pg_temp.moi('00000000-0000-0000-0000-00000000000b');
reset role;
-- Limité à ce compte : la base peut contenir les duels des parcours du navigateur.
create temp table code_duel on commit drop as select code from public.duels where createur = '00000000-0000-0000-0000-00000000000a' limit 1;
grant select on code_duel to authenticated;
set local role authenticated;
select throws_ok($$select public.rejoindre_duel('INCONNU')$$, 'SQ404', null, 'un code de duel inconnu est refusé');
select throws_ok(format($$select public.rejoindre_duel(%L)$$, (select code from code_duel)), 'SQ403', null, 'sans le cours, pas de duel');
select throws_ok(format($$select public.jouer_duel(%L)$$, (select id from duel)), 'SQ403', null, 'sans le cours, un appel direct ne donne pas les questions');
select public.rejoindre_cours((select code from partage));
select is(public.rejoindre_duel(lower(' ' || (select code from code_duel) || ' ')), (select id from duel), 'avec le cours, le code donne le duel');
select is(jsonb_array_length(public.jouer_duel((select id from duel)) -> 'questions'), 10, 'les deux personnes jouent le même nombre de questions');
select is((public.jouer_duel((select id from duel)) -> 'questions' -> 0 ->> 'id')::uuid, (select q1 from cible), 'et les mêmes questions');
select public.repondre_duel((select id from duel), (select q1 from cible), '{"choisies":[0]}');
select public.repondre_duel((select id from duel), (select q2 from cible), '{"choisies":[0]}');
select is(public.terminer_duel((select id from duel)) -> 'classement', '[{"moi": true, "justes": 2, "pseudo": "Ben"}, {"moi": false, "justes": 1, "pseudo": "Ana"}]'::jsonb, 'le classement compare les deux scores');
select is((public.mission_du_jour() ->> 'xp_total')::int, 0, 'un duel ne rapporte aucune XP');
select is((select count(*)::int from public.reviews), 0, 'un duel ne change pas la révision');
select is(public.mes_duels() -> 0 ->> 'joueurs', '2', 'mes duels indiquent combien de personnes ont joué');
select is(public.mes_duels() -> 0 ->> 'justes', '2', 'mes duels indiquent mon score');

select pg_temp.moi('00000000-0000-0000-0000-00000000000a');
select public.creer_duel('00000000-0000-0000-0000-0000000000c1');
select public.creer_duel('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.creer_duel('00000000-0000-0000-0000-0000000000c1')$$, 'SQ429', null, 'pas plus de 3 duels créés par jour');

-- Temps écoulé : la partie se termine avec les réponses déjà données.
select pg_temp.moi('00000000-0000-0000-0000-00000000000c');
reset role;
insert into public.courses (owner, titre, format, statut, partage_de)
  values ('00000000-0000-0000-0000-00000000000c', 'Copie', 'texte', 'pret', '00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.jouer_duel((select id from duel));
reset role;
update public.duel_parties set fin = now() - interval '10 seconds' where owner = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
select is(public.repondre_duel((select id from duel), (select q1 from cible), '{"choisies":[0]}'), false, 'une réponse après le temps imparti ne compte pas');
select ok(public.jouer_duel((select id from duel)) ? 'classement', 'le temps écoulé termine la partie');
select is((public.mes_duels() -> 0 ->> 'justes')::int, 0, 'sans réponse, le score est de 0');

select * from finish();
rollback;
