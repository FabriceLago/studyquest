begin;
select plan(55);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"pseudo":"B","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test', '{"pseudo":"E","declares_15_plus":true}');
insert into public.courses (id, owner, titre, format, statut, texte) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Cours', 'texte', 'generation', 'Le texte du cours'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'Autre', 'texte', 'generation', 'Autre texte');
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c1', jsonb_build_array(
  jsonb_build_object('titre', 'N1', 'ordre', 0, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', (
    select jsonb_agg(jsonb_build_object('type', 'unique', 'enonce', 'Q' || i, 'extrait', 'X' || i, 'difficulte', 'facile', 'ordre', i, 'presentation', '{"options":["a","b"]}'::jsonb, 'reponse', '{"correctes":[0]}'::jsonb, 'explication', 'E' || i))
    from generate_series(1, 4) i
  )),
  jsonb_build_object('titre', 'N2', 'ordre', 1, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', (
    select jsonb_agg(jsonb_build_object('type', 'unique', 'enonce', 'Q' || i, 'extrait', 'X' || i, 'difficulte', 'facile', 'ordre', i, 'presentation', '{"options":["a","b"]}'::jsonb, 'reponse', '{"correctes":[0]}'::jsonb, 'explication', 'E' || i))
    from generate_series(5, 8) i
  ))
), 0);
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c2', jsonb_build_array(
  jsonb_build_object('titre', 'N3', 'ordre', 0, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', jsonb_build_array(
    '{"type":"unique","enonce":"Q9","extrait":"X9","difficulte":"facile","ordre":0,"presentation":{"options":["a","b"]},"reponse":{"correctes":[0]},"explication":"E9"}'::jsonb
  ))
), 0);
create function pg_temp.q(p_enonce text, p_owner uuid default '00000000-0000-0000-0000-00000000000a') returns uuid
  language sql security definer as $$ select id from public.questions where enonce = p_enonce and owner = p_owner $$;
grant execute on function pg_temp.q(text, uuid) to authenticated;
create function pg_temp.jour() returns date language sql as $$ select (now() at time zone 'Europe/Paris')::date $$;
grant execute on function pg_temp.jour() to authenticated;

-- Mode examen
select is(public.prochaine_echeance('2026-11-04', 7, null), '2026-11-11'::date, 'sans examen, l''intervalle normal');
select is(public.prochaine_echeance('2026-11-04', 30, '2026-11-14'), '2026-11-09'::date, 'avec un examen, à la moitié du temps restant');
select is(public.prochaine_echeance('2026-11-04', 1, '2026-11-14'), '2026-11-05'::date, 'un intervalle plus court reste plus court');
select is(public.prochaine_echeance('2026-11-04', 7, '2026-11-05'), '2026-11-05'::date, 'la veille de l''examen, la question revient le lendemain');
select is(public.prochaine_echeance('2026-11-04', 7, '2026-11-04'), '2026-11-11'::date, 'le jour de l''examen, retour à la normale');
select is(public.prochaine_echeance('2026-11-04', 7, '2026-11-01'), '2026-11-11'::date, 'un examen passé ne change plus rien');

set local role anon;
select throws_ok($$select public.fixer_examen(gen_random_uuid(), null)$$, '42501', 'permission denied for function fixer_examen', 'un visiteur ne fixe pas d''examen');
select throws_ok($$select public.demarrer_examen(gen_random_uuid())$$, '42501', 'permission denied for function demarrer_examen', 'un visiteur ne passe pas d''examen blanc');
select throws_ok($$select public.rejoindre_cours('X')$$, '42501', 'permission denied for function rejoindre_cours', 'un visiteur ne rejoint pas de cours');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select throws_ok($$select * from public.examens_blancs$$, '42501', 'permission denied for table examens_blancs', 'le navigateur ne lit pas les examens directement');
select throws_ok(format($$select public.fixer_examen(%L, %L)$$, '00000000-0000-0000-0000-0000000000c1', pg_temp.jour() - 1), '22023', null, 'un examen ne peut pas être dans le passé');
select throws_ok(format($$select public.fixer_examen(%L, %L)$$, '00000000-0000-0000-0000-0000000000c1', pg_temp.jour() + 366), '22023', null, 'un examen ne peut pas être dans plus d''un an');

-- Mini-mission
select public.submit_answer(pg_temp.q('Q9'), 'decouvrir', '{"choisies":[0]}');
select is(public.submit_answer(pg_temp.q('Q1'), 'decouvrir', '{"choisies":[1]}') ->> 'juste', 'false', 'une erreur en découverte');
select is((public.mission_du_jour() ->> 'jour_compte')::boolean, false, 'deux réponses ne suffisent pas à garder la série');
select is(public.submit_answer(pg_temp.q('Q2'), 'decouvrir', '{"choisies":[0]}') ->> 'juste', 'true', 'une bonne réponse en découverte');
select is((public.mission_du_jour() ->> 'jour_compte')::boolean, true, 'trois réponses dans la journée la font compter pour la série');
select is((select decouvrir_fait from public.daily_stats where jour = pg_temp.jour()), false, 'la mini-mission ne termine pas la mission');
select is((public.mission_du_jour() ->> 'xp_jour')::int, 10, 'la mini-mission n''ajoute aucune prime');

reset role;
update public.reviews set boite = 4, echeance = pg_temp.jour() + 14 where question_id = pg_temp.q('Q2');
update public.reviews set boite = 4, echeance = pg_temp.jour() - 9 where question_id = pg_temp.q('Q9');
update public.reviews set boite = 1, echeance = pg_temp.jour() - 1 where question_id = pg_temp.q('Q1');
set local role authenticated;
select lives_ok(format($$select public.fixer_examen(%L, %L)$$, '00000000-0000-0000-0000-0000000000c1', pg_temp.jour() + 6), 'fixer une date d''examen');
select is((select echeance from public.reviews where question_id = pg_temp.q('Q2')), pg_temp.jour() + 3, 'une question prévue après l''examen est rapprochée');
select is((select echeance from public.reviews where question_id = pg_temp.q('Q9')), pg_temp.jour() - 9, 'les questions d''un autre cours ne bougent pas');
select is(public.questions_mission('reviser') -> 'questions' -> 0 ->> 'enonce', 'Q1', 'le cours avec examen passe avant les plus en retard');
select is(public.submit_answer(pg_temp.q('Q1'), 'reviser', '{"choisies":[0]}') ->> 'juste', 'true', 'réviser une question du cours avec examen');
select ok((select boite = 2 and echeance = pg_temp.jour() + 3 from public.reviews where question_id = pg_temp.q('Q1')), 'la boîte avance et l''échéance respecte l''examen');
select lives_ok(format($$select public.fixer_examen(%L, null)$$, '00000000-0000-0000-0000-0000000000c1'), 'retirer la date d''examen');
select is((select date_examen from public.courses where id = '00000000-0000-0000-0000-0000000000c1'), null, 'la date est retirée');

-- Examen blanc
select throws_ok($$select public.demarrer_examen(gen_random_uuid())$$, 'SQ404', null, 'pas d''examen blanc sur un cours inconnu');
create temp table examen on commit drop as select public.demarrer_examen('00000000-0000-0000-0000-0000000000c1') as e;
select is((select jsonb_array_length(e -> 'questions') from examen), 8, 'l''examen blanc reprend les questions du cours');
select ok((select e::text !~ 'correctes|explication|extrait' from examen), 'l''examen blanc ne révèle aucune réponse');
select ok((select (e ->> 'secondes')::int between 479 and 480 from examen), 'une minute par question');
select is(public.demarrer_examen('00000000-0000-0000-0000-0000000000c1') ->> 'id', (select e ->> 'id' from examen), 'relancer le même jour reprend le même examen');
select is(public.repondre_examen((select (e ->> 'id')::uuid from examen), pg_temp.q('Q5'), '{"choisies":[0]}'), true, 'une réponse est gardée');
select is(jsonb_array_length(public.demarrer_examen('00000000-0000-0000-0000-0000000000c1') -> 'questions'), 7, 'une reprise ne repropose pas une question répondue');
select is(public.repondre_examen((select (e ->> 'id')::uuid from examen), pg_temp.q('Q9'), '{"choisies":[0]}'), false, 'une question hors de l''examen est refusée');
select is(public.repondre_examen((select (e ->> 'id')::uuid from examen), pg_temp.q('Q6'), '{"choisies":[1]}'), true, 'une réponse fausse est gardée sans être signalée');
select is(public.rendre_examen((select (e ->> 'id')::uuid from examen)) -> 'notions' -> 1, '{"titre": "N2", "total": 4, "justes": 1}'::jsonb, 'le score est donné par notion, les absences comptent comme fausses');
select is(public.rendre_examen((select (e ->> 'id')::uuid from examen)) ->> 'justes', '1', 'le score total');
select is(public.repondre_examen((select (e ->> 'id')::uuid from examen), pg_temp.q('Q7'), '{"choisies":[0]}'), false, 'plus de réponse après le rendu');
select is(public.demarrer_examen('00000000-0000-0000-0000-0000000000c1') -> 'score' ->> 'total', '8', 'une seule fois par jour : le score revient');
select is((public.mission_du_jour() ->> 'xp_jour')::int, 20, 'l''examen blanc ne rapporte aucune XP');
select is((select boite::int from public.reviews where question_id = pg_temp.q('Q2')), 4, 'l''examen blanc ne change pas la révision');

-- Partage
select throws_ok($$select public.partager_cours('00000000-0000-0000-0000-0000000000c1', false)$$, '22023', null, 'pas de code sans déclarer le droit de partager');
create temp table partage on commit drop as select public.partager_cours('00000000-0000-0000-0000-0000000000c1', true) as code;
select is(public.partager_cours('00000000-0000-0000-0000-0000000000c1', true), (select code from partage), 'le code reste le même');
select throws_ok(format($$select public.rejoindre_cours(%L)$$, (select code from partage)), 'SQ409', null, 'on ne rejoint pas son propre cours');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select throws_ok($$select public.rejoindre_cours('INCONNU')$$, 'SQ404', null, 'un code inconnu est refusé');
create temp table copie on commit drop as select public.rejoindre_cours(lower(' ' || (select code from partage) || ' ')) as id;
select is(public.rejoindre_cours((select code from partage)), (select id from copie), 'rejoindre deux fois ne crée pas deux copies');
select ok((select statut = 'pret' and texte is null and code_partage is null and cout_usd = 0 from public.courses where id = (select id from copie)), 'la copie est prête, sans le texte du cours ni coût');
select is((select count(*)::int from public.questions), 8, 'la copie contient toutes les questions');
select is((public.mission_du_jour() -> 'decouvrir' ->> 'questions')::int, 8, 'la copie se révise comme un autre cours');
select is(public.submit_answer(pg_temp.q('Q1', '00000000-0000-0000-0000-00000000000b'), 'decouvrir', '{"choisies":[0]}') ->> 'explication', 'E1', 'les corrections sont copiées');
select throws_ok(format($$select public.partager_cours(%L, true)$$, (select id from copie)), 'SQ409', null, 'une copie ne se repartage pas');
select is((select count(*)::int from public.import_usage), 0, 'recevoir une copie ne consomme aucun quota');

-- Une journée de mini-mission compte dans la série, mais pas les réponses au défi.
reset role;
insert into public.daily_stats (owner, jour, mini_fait) values
  ('00000000-0000-0000-0000-00000000000e', '2026-11-19', true),
  ('00000000-0000-0000-0000-00000000000e', '2026-11-20', true);
select is((select serie from public.serie_et_gels('00000000-0000-0000-0000-00000000000e', '2026-11-20')), 2, 'une journée de mini-mission compte dans la série');
delete from public.attempts where owner = '00000000-0000-0000-0000-00000000000a' and jour = pg_temp.jour();
update public.daily_stats set mini_fait = false where owner = '00000000-0000-0000-0000-00000000000a';
insert into public.attempts (owner, mission, juste, xp, jour)
  select '00000000-0000-0000-0000-00000000000a', 'defi', true, 0, pg_temp.jour() from generate_series(1, 3);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is(public.submit_answer(pg_temp.q('Q3'), 'decouvrir', '{"choisies":[0]}') ->> 'compte', 'true', 'une réponse après trois réponses au défi');
select is((select mini_fait from public.daily_stats where jour = pg_temp.jour()), false, 'les réponses au défi ne comptent pas pour la mini-mission');

select * from finish();
rollback;
