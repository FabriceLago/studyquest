begin;
select plan(89);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"pseudo":"B","declares_15_plus":true}');
insert into public.courses (id, owner, titre, format, statut) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Cours', 'texte', 'generation');
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c1', (
  select jsonb_agg(n) from (values
    (jsonb_build_object('titre', 'N1', 'ordre', 0, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', jsonb_build_array(
      '{"type":"unique","enonce":"Q1","extrait":"X1","difficulte":"facile","ordre":0,"presentation":{"options":["a","b"]},"reponse":{"correctes":[0]},"explication":"E1"}'::jsonb,
      '{"type":"multiple","enonce":"Q2","extrait":"X2","difficulte":"facile","ordre":1,"presentation":{"options":["a","b","c"]},"reponse":{"correctes":[0,1]},"explication":"E2"}'::jsonb,
      '{"type":"vrai_faux","enonce":"Q3","extrait":"X3","difficulte":"facile","ordre":2,"presentation":{"options":["Vrai","Faux"]},"reponse":{"correctes":[1]},"explication":"E3"}'::jsonb,
      '{"type":"association","enonce":"Q4","extrait":"X4","difficulte":"facile","ordre":3,"presentation":{"gauche":["a","b"],"droite":["2","1"]},"reponse":{"associations":[1,0]},"explication":"E4"}'::jsonb,
      '{"type":"classement","enonce":"Q5","extrait":"X5","difficulte":"facile","ordre":4,"presentation":{"etapes":["c","a","b"]},"reponse":{"ordre":[1,2,0]},"explication":"E5"}'::jsonb
    ))),
    (jsonb_build_object('titre', 'N2', 'ordre', 1, 'carte_recto', 'r', 'carte_verso', 'v', 'questions', (
      select jsonb_agg(jsonb_build_object('type', 'unique', 'enonce', 'Q' || i, 'extrait', 'X', 'difficulte', 'facile', 'ordre', i, 'presentation', '{"options":["a","b"]}'::jsonb, 'reponse', '{"correctes":[0]}'::jsonb, 'explication', 'E'))
      from generate_series(6, 10) i
    )))
  ) t(n)
), 0);
-- Sans RLS, pour désigner une question quel que soit le compte connecté.
create function pg_temp.q(p_enonce text) returns uuid language sql security definer as $$ select id from public.questions where enonce = p_enonce $$;
grant execute on function pg_temp.q(text) to authenticated;
create function pg_temp.jour() returns date language sql as $$ select (now() at time zone 'Europe/Paris')::date $$;
grant execute on function pg_temp.jour() to authenticated;

select ok(public.reponse_juste('classement', '{"ordre":[1,2,0]}', '{"ordre":[0,1,2]}') = false, 'un mauvais classement est faux');
select ok(public.reponse_juste('association', '{"associations":[1,0]}', '{"associations":[0,1]}') = false, 'une mauvaise association est fausse');
select ok(public.reponse_juste('multiple', '{"correctes":[0,1]}', '{"choisies":[0]}') = false, 'un choix multiple incomplet est faux');
select ok(public.reponse_juste('unique', '{"correctes":[0]}', '{"choisies":"0"}') = false, 'une réponse mal formée est fausse, sans erreur');
select ok(public.reponse_juste('classement', '{"ordre":[1,2,0]}', '{}') = false, 'une réponse vide est fausse');

set local role anon;
select throws_ok($$select public.mission_du_jour()$$, '42501', 'permission denied for function mission_du_jour', 'un visiteur ne voit aucune mission');
select throws_ok($$select public.submit_answer(gen_random_uuid(), 'reviser', '{}')$$, '42501', 'permission denied for function submit_answer', 'un visiteur ne répond pas');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select throws_ok($$select public.retention_j7()$$, '42501', 'permission denied for function retention_j7', 'un élève ne lit pas la rétention');
select throws_ok($$select public.serie_et_gels(gen_random_uuid(), current_date)$$, '42501', 'permission denied for function serie_et_gels', 'un élève ne calcule pas la série d''un autre');
select throws_ok($$insert into public.daily_stats (owner, jour, xp) values ('00000000-0000-0000-0000-00000000000a', current_date, 300)$$, '42501', 'permission denied for table daily_stats', 'le navigateur ne s''attribue pas d''XP');
select throws_ok($$update public.reviews set boite = 5$$, '42501', 'permission denied for table reviews', 'le navigateur ne change pas une boîte');
select throws_ok($$insert into public.attempts (owner, mission, juste, xp, jour) values ('00000000-0000-0000-0000-00000000000a', 'defi', true, 2, current_date)$$, '42501', 'permission denied for table attempts', 'le navigateur n''écrit pas de tentative');

select is((public.mission_du_jour() -> 'decouvrir' ->> 'questions')::int, 8, 'découvrir propose 8 questions');
select is((public.mission_du_jour() -> 'reviser' ->> 'questions')::int, 0, 'rien à réviser au départ');
select is((public.mission_du_jour() -> 'defi' ->> 'disponible')::boolean, false, 'pas de défi avant 5 questions vues');
select is((public.questions_mission('decouvrir') -> 'questions' -> 0 ->> 'enonce'), 'Q1', 'les questions suivent l''ordre du cours');
select is((public.questions_mission('decouvrir') -> 'questions' -> 0 ->> 'cours'), 'Cours', 'une question indique son cours');
select is(jsonb_array_length(public.questions_mission('decouvrir') -> 'questions'), 8, 'une session de découverte compte 8 questions');
select ok(public.questions_mission('decouvrir')::text !~ 'correctes|"associations"|explication|extrait', 'les questions ne révèlent aucune réponse');
select throws_ok($$select public.questions_mission('defi')$$, 'SQ409', null, 'le défi est refusé avant 5 questions vues');
select throws_ok($$select public.submit_answer(pg_temp.q('Q1'), 'autre', '{}')$$, '22023', null, 'une mission inconnue est refusée');

select is(public.submit_answer(pg_temp.q('Q1'), 'decouvrir', '{"choisies":[1]}') ->> 'xp', '0', 'une mauvaise réponse ne rapporte rien');
select ok((select boite = 1 and echeance = pg_temp.jour() + 1 from public.reviews where question_id = pg_temp.q('Q1')), 'une nouvelle question entre en boîte 1, à revoir demain, même ratée');
select is(public.submit_answer(pg_temp.q('Q2'), 'decouvrir', '{"choisies":[1,0]}') ->> 'xp', '5', 'nouvelle question juste : 5 XP, quel que soit l''ordre des cases');
select is(public.submit_answer(pg_temp.q('Q3'), 'decouvrir', '{"choisies":[1]}') ->> 'juste', 'true', 'un vrai ou faux juste');
select is(public.submit_answer(pg_temp.q('Q4'), 'decouvrir', '{"associations":[1,0]}') ->> 'juste', 'true', 'une association juste');
select is(public.submit_answer(pg_temp.q('Q5'), 'decouvrir', '{"ordre":[1,2,0]}') ->> 'explication', 'E5', 'l''explication arrive avec la correction');
select is(public.submit_answer(pg_temp.q('Q2'), 'decouvrir', '{"choisies":[0,1]}')::text, '{"compte": false}', 'répondre deux fois à une question ne rapporte rien et ne dévoile rien');
select is(public.submit_answer(pg_temp.q('Q6'), 'decouvrir', '{"choisies":[0]}') ->> 'xp', '5', 'la 6e question rapporte 5 XP');
select is(public.submit_answer(pg_temp.q('Q7'), 'decouvrir', '{"choisies":[0]}') ->> 'prime', '0', 'pas de prime avant la fin de la mission');
select is(public.submit_answer(pg_temp.q('Q8'), 'decouvrir', '{"choisies":[0]}') ->> 'prime', '20', 'la 8e question termine la mission : 20 XP');
select is((public.mission_du_jour() ->> 'xp_jour')::int, 55, '7 bonnes réponses à 5 XP et la prime font 55 XP');
select is((public.mission_du_jour() -> 'decouvrir' ->> 'fait')::boolean, true, 'la mission découvrir est terminée');
select is((public.mission_du_jour() -> 'decouvrir' ->> 'questions')::int, 0, 'plus aucune nouvelle question aujourd''hui');
select is(public.submit_answer(pg_temp.q('Q9'), 'decouvrir', '{"choisies":[0]}')::text, '{"compte": false}', 'une 9e nouvelle question est refusée, même par un appel direct');
select is((select count(*)::int from public.reviews where question_id = pg_temp.q('Q9')), 0, 'la 9e question reste nouvelle');
select is(public.submit_answer(pg_temp.q('Q2'), 'reviser', '{"choisies":[0,1]}')::text, '{"compte": false}', 'une question non due ne rapporte rien et ne dévoile pas sa réponse');
select is((select boite::int from public.reviews where question_id = pg_temp.q('Q2')), 1, 'une question non due garde sa boîte');

reset role;
update public.reviews set echeance = pg_temp.jour() - 1 where question_id = pg_temp.q('Q2');
update public.reviews set echeance = pg_temp.jour() - 5, boite = 3 where question_id = pg_temp.q('Q3');
set local role authenticated;
select is(jsonb_array_length(public.questions_mission('reviser') -> 'questions'), 2, 'les questions dues sont proposées');
select is(public.questions_mission('reviser') -> 'questions' -> 0 ->> 'enonce', 'Q3', 'les plus en retard d''abord');
select is(public.submit_answer(pg_temp.q('Q2'), 'reviser', '{"choisies":[0,1]}') ->> 'xp', '10', 'question due juste : 10 XP');
select ok((select boite = 2 and echeance = pg_temp.jour() + 3 from public.reviews where question_id = pg_temp.q('Q2')), 'une bonne réponse passe en boîte 2, à 3 jours');
select is(public.submit_answer(pg_temp.q('Q3'), 'reviser', '{"choisies":[0]}') ->> 'prime', '20', 'plus rien de dû : la mission réviser est terminée');
select ok((select boite = 1 and echeance = pg_temp.jour() + 1 from public.reviews where question_id = pg_temp.q('Q3')), 'une mauvaise réponse renvoie en boîte 1, à demain');

reset role;
update public.reviews set boite = 5, echeance = pg_temp.jour() where question_id = pg_temp.q('Q6');
set local role authenticated;
select is(public.submit_answer(pg_temp.q('Q6'), 'reviser', '{"choisies":[0]}') ->> 'prime', '0', 'la prime de mission n''est donnée qu''une fois par jour');
select ok((select boite = 5 and echeance = pg_temp.jour() + 30 from public.reviews where question_id = pg_temp.q('Q6')), 'la boîte 5 reste la dernière, à 30 jours');

select is(public.terminer_defi() ->> 'prime', '0', 'pas de prime de défi sans l''avoir commencé');
select ok((public.questions_mission('defi') ->> 'secondes')::int between 59 and 60, 'le défi démarre son chrono côté serveur');
select is(jsonb_array_length(public.questions_mission('defi') -> 'questions'), 8, 'le défi ne propose que des questions déjà vues');
select ok(public.questions_mission('defi')::text !~ 'correctes|"associations"|explication|extrait', 'le défi ne révèle aucune réponse');
select is(public.terminer_defi() ->> 'prime', '0', 'pas de prime de défi sans une seule réponse');
select is(public.submit_answer(pg_temp.q('Q2'), 'defi', '{"choisies":[0,1]}') ->> 'xp', '2', 'réponse juste au défi : 2 XP');
select ok(not public.submit_answer(pg_temp.q('Q3'), 'defi', '{"choisies":[1]}') ? 'reponse', 'le défi ne montre pas la correction');
select is(public.submit_answer(pg_temp.q('Q2'), 'defi', '{"choisies":[0,1]}')::text, '{"compte": false}', 'rejouer une question du défi ne rapporte rien');
select is((select boite::int from public.reviews where question_id = pg_temp.q('Q2')), 2, 'le défi ne change pas la révision');
select is(jsonb_array_length(public.questions_mission('defi') -> 'questions'), 6, 'recharger le défi ne repropose pas ses questions');
select is(public.terminer_defi() ->> 'prime', '20', 'le défi terminé donne sa prime');
select is(public.terminer_defi() ->> 'prime', '0', 'la prime du défi n''est donnée qu''une fois');
select is(public.terminer_defi() - 'prime', '{"xp": 4, "total": 2, "justes": 2}'::jsonb, 'le bilan du défi vient du serveur');
select is(public.submit_answer(pg_temp.q('Q4'), 'defi', '{"associations":[1,0]}')::text, '{"compte": false}', 'seul le premier essai du jour rapporte de l''XP');
select is(public.questions_mission('defi') ->> 'secondes', '0', 'un seul essai de défi par jour');

reset role;
update public.daily_stats set defi_fait = false, defi_debut = now() - interval '62 seconds' where owner = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select is(public.submit_answer(pg_temp.q('Q4'), 'defi', '{"associations":[1,0]}') ->> 'compte', 'true', 'la dernière réponse en route est acceptée');
reset role;
update public.daily_stats set defi_debut = now() - interval '70 seconds' where owner = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select is(public.submit_answer(pg_temp.q('Q5'), 'defi', '{"ordre":[1,2,0]}')::text, '{"compte": false}', 'une réponse après le temps imparti ne compte pas');
select is(public.questions_mission('defi') ->> 'secondes', '0', 'le temps écoulé termine le défi');
select is((public.mission_du_jour() -> 'defi' ->> 'disponible')::boolean, true, 'un défi écoulé avec des réponses peut encore être clôturé');
reset role;
delete from public.attempts where mission = 'defi' and owner = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select is((public.mission_du_jour() -> 'defi' ->> 'disponible')::boolean, false, 'un essai passé sans réponse ne revient que demain');

reset role;
update public.daily_stats set xp = 295, reviser_fait = false where owner = '00000000-0000-0000-0000-00000000000a';
update public.reviews set echeance = pg_temp.jour() where question_id = pg_temp.q('Q4');
set local role authenticated;
select is(x.r ->> 'xp', '5', 'le plafond de 300 XP par jour limite le gain') from (select public.submit_answer(pg_temp.q('Q4'), 'reviser', '{"associations":[1,0]}') r) x;
select is((public.mission_du_jour() ->> 'xp_jour')::int, 300, 'le plafond vaut aussi pour la prime de mission');
select is((public.mission_du_jour() -> 'reviser' ->> 'fait')::boolean, true, 'une mission terminée au plafond compte quand même');

reset role;
insert into public.attempts (owner, mission, juste, xp, jour)
  select '00000000-0000-0000-0000-00000000000a', 'reviser', true, 0, pg_temp.jour() from generate_series(1, 15);
update public.reviews set echeance = pg_temp.jour() where question_id = pg_temp.q('Q5');
set local role authenticated;
select is((public.mission_du_jour() -> 'reviser' ->> 'questions')::int, 0, 'pas plus de 15 révisions par jour');
select is(jsonb_array_length(public.questions_mission('reviser') -> 'questions'), 0, 'la 16e révision n''est pas proposée');
select is(public.submit_answer(pg_temp.q('Q5'), 'reviser', '{"ordre":[1,2,0]}')::text, '{"compte": false}', 'la 16e révision est refusée, même par un appel direct');

reset role;
update public.reviews set boite = 3 where question_id in (select id from public.questions where notion_id = (select notion_id from public.questions where enonce = 'Q1'));
set local role authenticated;
select is((public.mission_du_jour() ->> 'notions_maitrisees')::int, 1, 'une notion est maîtrisée quand toutes ses questions sont en boîte 3');
reset role;
update public.reviews set boite = 2 where question_id = pg_temp.q('Q1');
set local role authenticated;
select is((public.mission_du_jour() ->> 'notions_maitrisees')::int, 0, 'une question en boîte 2 suffit à ne plus la maîtriser');

reset role;
insert into public.daily_stats (owner, jour, xp) values ('00000000-0000-0000-0000-00000000000a', pg_temp.jour() - 1, 100);
set local role authenticated;
select is((public.mission_du_jour() ->> 'xp_total')::int, 400, 'l''XP totale additionne les jours');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select throws_ok(format($$select public.submit_answer(%L, 'reviser', '{}')$$, pg_temp.q('Q1')), 'SQ404', null, 'on ne répond pas à la question d''un autre compte');
select is((select count(*)::int from public.reviews) + (select count(*)::int from public.attempts) + (select count(*)::int from public.daily_stats), 0, 'on ne lit pas la progression d''un autre compte');
select ok((public.mission_du_jour() ->> 'serie')::int = 0 and (public.mission_du_jour() ->> 'gels')::int = 2, 'un nouveau compte n''a pas de série et garde ses 2 gels');

reset role;
create function pg_temp.serie(p_actifs date[], p_aujourdhui date, p_sans_mission date[] default '{}') returns text language plpgsql as $$
begin
  delete from public.daily_stats where owner = '00000000-0000-0000-0000-00000000000b';
  insert into public.daily_stats (owner, jour, decouvrir_fait)
    select '00000000-0000-0000-0000-00000000000b', j, true from unnest(p_actifs) j;
  insert into public.daily_stats (owner, jour)
    select '00000000-0000-0000-0000-00000000000b', j from unnest(p_sans_mission) j;
  return (select s.serie || '/' || s.gels from public.serie_et_gels('00000000-0000-0000-0000-00000000000b', p_aujourdhui) s);
end;
$$;
select is(pg_temp.serie('{}', '2026-11-20'), '0/2', 'aucune mission : pas de série');
select is(pg_temp.serie('{2026-11-18,2026-11-19,2026-11-20}', '2026-11-20'), '3/2', 'trois jours de suite font une série de 3');
select is(pg_temp.serie('{2026-11-18,2026-11-19}', '2026-11-20'), '2/2', 'une journée pas encore jouée ne casse pas la série');
select is(pg_temp.serie('{2026-11-17,2026-11-19,2026-11-20}', '2026-11-20'), '3/1', 'un jour manqué consomme un gel, sans allonger la série');
select is(pg_temp.serie('{2026-11-16,2026-11-19,2026-11-20}', '2026-11-20'), '3/0', 'deux jours manqués consomment les deux gels');
select is(pg_temp.serie('{2026-11-15,2026-11-19,2026-11-20}', '2026-11-20'), '2/2', 'trois jours manqués cassent la série et ne consomment aucun gel');
select is(pg_temp.serie('{2026-11-17,2026-11-18}', '2026-11-20'), '2/1', 'hier manqué et aujourd''hui à venir : un gel protège la série');
select is(pg_temp.serie('{2026-10-30,2026-11-03}', '2026-11-03'), '2/0', 'chaque mois civil a ses propres gels');
select is(pg_temp.serie('{2026-11-18,2026-11-20}', '2026-11-20', '{2026-11-19}'), '2/1', 'répondre sans terminer de mission ne compte pas pour la série');

create temp table base as select * from public.retention_j7();
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test', '{"pseudo":"D1","declares_15_plus":true}', now() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@example.test', '{"pseudo":"D2","declares_15_plus":true}', now() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@example.test', '{"pseudo":"D3","declares_15_plus":true}', now() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000000d4', 'd4@example.test', '{"pseudo":"D4","declares_15_plus":true}', now() - interval '5 days');
insert into public.attempts (owner, mission, juste, xp, jour, created_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'reviser', true, 0, current_date, now() - interval '12 days'),
  ('00000000-0000-0000-0000-0000000000d2', 'reviser', true, 0, current_date, now() - interval '17 days'),
  ('00000000-0000-0000-0000-0000000000d3', 'reviser', true, 0, current_date, now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000d4', 'reviser', true, 0, current_date, now());
select is((select r.inscrits - b.inscrits from public.retention_j7() r, base b), 3, 'la rétention ne compte que les inscrits d''au moins 14 jours');
select is((select r.revenus - b.revenus from public.retention_j7() r, base b), 1, 'seule une tentative entre le 7e et le 13e jour compte');

select * from finish();
rollback;
