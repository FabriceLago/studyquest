begin;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"pseudo":"B","declares_15_plus":true}');
insert into public.courses (id, owner, titre, format, statut, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Biologie', 'texte', 'generation', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'Histoire', 'texte', 'generation', now() - interval '1 hour');
create function pg_temp.question(p_enonce text, p_ordre int) returns jsonb language sql as $$
  select jsonb_build_object('type', 'unique', 'enonce', p_enonce, 'extrait', 'X', 'difficulte', 'facile', 'ordre', p_ordre,
    'presentation', '{"options":["a","b"]}'::jsonb, 'reponse', '{"correctes":[0]}'::jsonb, 'explication', 'E')
$$;
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c1', jsonb_build_array(
  jsonb_build_object('titre', 'N1', 'ordre', 0, 'carte_recto', 'r', 'carte_verso', 'v',
    'questions', jsonb_build_array(pg_temp.question('V1', 0), pg_temp.question('V2', 1))),
  jsonb_build_object('titre', 'N2', 'ordre', 1, 'carte_recto', 'r', 'carte_verso', 'v',
    'questions', jsonb_build_array(pg_temp.question('V3', 0)))
), 0);
select public.enregistrer_generation('00000000-0000-0000-0000-0000000000c2', jsonb_build_array(
  jsonb_build_object('titre', 'N3', 'ordre', 0, 'carte_recto', 'r', 'carte_verso', 'v',
    'questions', jsonb_build_array(pg_temp.question('V4', 0)))
), 0);
create function pg_temp.q(p_enonce text) returns uuid language sql security definer as $$
  select id from public.questions where enonce = p_enonce and owner = '00000000-0000-0000-0000-00000000000a'
$$;
grant execute on function pg_temp.q(text) to authenticated;
create function pg_temp.jour() returns date language sql as $$ select (now() at time zone 'Europe/Paris')::date $$;

set local role anon;
select throws_ok($$select public.ma_ville()$$, '42501', 'permission denied for function ma_ville', 'un visiteur ne voit aucune ville');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is(jsonb_array_length(public.ma_ville()), 2, 'un quartier par cours');
select is(public.ma_ville() -> 0 ->> 'titre', 'Biologie', 'les quartiers suivent l''ordre d''import');
select is(jsonb_array_length(public.ma_ville() -> 0 -> 'notions'), 2, 'un emplacement par notion');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'etat', 'vide', 'une notion pas encore découverte reste un terrain vide');

select public.submit_answer(pg_temp.q('V1'), 'decouvrir', '{"choisies":[0]}');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'etat', 'chantier', 'une notion commencée devient un chantier');

reset role;
update public.reviews set boite = 2, echeance = pg_temp.jour() - 1 where question_id = pg_temp.q('V1');
set local role authenticated;
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'due', 'true', 'une question due affiche un repère');
select public.submit_answer(pg_temp.q('V1'), 'reviser', '{"choisies":[0]}');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'etat', 'chantier', 'pas de bâtiment tant qu''une question de la notion n''est pas en boîte 3');

select public.submit_answer(pg_temp.q('V2'), 'decouvrir', '{"choisies":[0]}');
reset role;
update public.reviews set boite = 2, echeance = pg_temp.jour() - 1 where question_id = pg_temp.q('V2');
set local role authenticated;
select public.submit_answer(pg_temp.q('V2'), 'reviser', '{"choisies":[0]}');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'etat', 'batie', 'toutes les questions en boîte 3 : le bâtiment est posé');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'recent', 'true', 'un bâtiment du jour est signalé pour son animation');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'due', 'false', 'plus rien de dû : pas de repère');
select is(public.ma_ville() -> 0 -> 'notions' -> 1 ->> 'etat', 'vide', 'les autres notions ne changent pas');

reset role;
update public.reviews set echeance = pg_temp.jour() - 1 where question_id = pg_temp.q('V1');
set local role authenticated;
select is(public.submit_answer(pg_temp.q('V1'), 'reviser', '{"choisies":[1]}') ->> 'juste', 'false', 'une erreur renvoie la question en boîte 1');
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'etat', 'batie', 'un bâtiment n''est jamais détruit');
select is((public.mission_du_jour() ->> 'notions_maitrisees')::int, 0, 'la notion n''est plus maîtrisée, mais son bâtiment reste');
reset role;
update public.reviews set echeance = pg_temp.jour() where question_id = pg_temp.q('V2');
set local role authenticated;
select is(public.ma_ville() -> 0 -> 'notions' -> 0 ->> 'due', 'true', 'un bâtiment à revoir garde son repère');

reset role;
update public.courses set statut = 'a_relire' where id = '00000000-0000-0000-0000-0000000000c2';
set local role authenticated;
select is(jsonb_array_length(public.ma_ville()), 1, 'un cours pas encore prêt n''a pas de quartier');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is(public.ma_ville(), '[]'::jsonb, 'on ne voit pas la ville d''un autre compte');

reset role;
select is((select count(*)::int from public.notions where batie_at is not null and owner = '00000000-0000-0000-0000-00000000000a'), 1, 'un seul bâtiment posé');

select * from finish();
rollback;
