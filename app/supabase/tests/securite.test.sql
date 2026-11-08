-- Corrections de sécurité du 08/11 (migration 20261108100000_securite.sql), vérifiées côté base.
begin;
select plan(9);

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', true, '{"declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000a2', true, '{"declares_15_plus":true}');

-- Aides définies comme superutilisateur (hors RLS), appelées plus tard sous le rôle authenticated.
create function pg_temp.notion() returns jsonb language sql as $$
  select '[{"titre":"N","a_retenir":"R","questions":[{"enonce":"E","choix":[{"texte":"bon","correcte":true},{"texte":"faux","correcte":false}]}]}]'::jsonb
$$;
create function pg_temp.coursA() returns uuid language sql security definer as $$
  select id from public.courses where owner = '00000000-0000-0000-0000-0000000000a1' and partage_de is null $$;
create function pg_temp.copie() returns uuid language sql security definer as $$
  select id from public.courses where owner = '00000000-0000-0000-0000-0000000000a2' and partage_de is not null $$;
create function pg_temp.code() returns text language sql security definer as $$
  select code_partage from public.courses where id = pg_temp.coursA() $$;
grant execute on function pg_temp.notion(), pg_temp.coursA(), pg_temp.copie(), pg_temp.code() to authenticated;

-- A écrit un cours manuel et le partage ; B en reçoit une copie.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","is_anonymous":true}';
select public.ecrire_cours(null, 'Cours de A', pg_temp.notion());
select public.partager_cours(pg_temp.coursA(), true);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","is_anonymous":true}';
select public.rejoindre_cours(pg_temp.code());
select isnt(pg_temp.copie(), null, 'B a bien reçu une copie');

-- A supprime le cours d'origine. La copie de B doit RESTER une copie (marqueur conservé).
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","is_anonymous":true}';
select lives_ok($$delete from public.courses where id = pg_temp.coursA()$$, 'A supprime son cours d''origine');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","is_anonymous":true}';
select is((select partage_de is not null from public.courses where id = pg_temp.copie()), true, 'la copie reste marquée comme copie après la suppression de l''original');
select throws_ok($$select public.partager_cours(pg_temp.copie(), true)$$, 'SQ409', 'Une copie ne se repartage pas.', 'une copie ne se repartage pas, même après suppression de l''original');
select throws_ok($$select public.ecrire_cours(pg_temp.copie(), null, pg_temp.notion())$$, 'SQ404', 'Cours introuvable.', 'une copie ne se modifie pas, même après suppression de l''original');

-- submit_answer borne la taille de la réponse.
select throws_ok(
  $$select public.submit_answer(gen_random_uuid(), 'decouvrir', (select jsonb_build_object('choisies', jsonb_agg(i)) from generate_series(1, 2000) i))$$,
  '22023', 'Réponse trop longue.', 'une réponse démesurée est refusée par submit_answer'
);

-- Stockage : un dépôt n'est permis que vers un cours que l'on possède et qui est en cours d'import.
reset role;
insert into public.courses (id, owner, titre, format, statut) values
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000a2', 'Import', 'pdf', 'en_attente');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","is_anonymous":true}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('imports', '00000000-0000-0000-0000-0000000000a2/00000000-0000-0000-0000-0000000000c9/01.pdf')$$,
  'un dépôt vers son propre import en cours est permis'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('imports', '00000000-0000-0000-0000-0000000000a2/00000000-0000-0000-0000-00000000dead/01.pdf')$$,
  '42501', null, 'un dépôt sans import correspondant est refusé'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('imports', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c9/01.pdf')$$,
  '42501', null, 'un dépôt dans le dossier d''un autre compte est refusé'
);

select * from finish();
rollback;
