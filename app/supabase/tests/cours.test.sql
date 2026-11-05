begin;
select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"pseudo":"B","declares_15_plus":true}');

select is((select public from storage.buckets where id = 'imports'), false, 'le dépôt des fichiers est privé');

set local role anon;
select throws_ok($$select public.creer_import('Cours', 'texte', 'x')$$, '42501', 'permission denied for function creer_import', 'un visiteur ne crée rien');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select lives_ok($$select public.creer_import('Cours', 'texte', 'un texte de cours')$$, 'un compte crée un import');
select throws_ok($$select public.creer_import('Autre', 'texte', 'x')$$, 'SQ409', null, 'un seul import à la fois');
select throws_ok($$select public.creer_import('Sans texte', 'texte', null)$$, '22023', null, 'un import de texte exige le texte');
select is((select count(*)::int from public.courses), 1, 'le compte voit son cours');
select throws_ok($$update public.courses set statut = 'pret'$$, '42501', null, 'le statut n''est pas modifiable depuis le navigateur');
select throws_ok($$insert into public.notions (course_id, owner, titre, ordre, carte_recto, carte_verso) values (gen_random_uuid(), auth.uid(), 't', 1, 'r', 'v')$$, '42501', null, 'une notion ne s''écrit pas depuis le navigateur');
select throws_ok($$select * from public.answer_keys$$, '42501', null, 'les réponses ne se lisent pas depuis le navigateur');
select throws_ok($$select public.enregistrer_generation(gen_random_uuid(), '[]', 0)$$, '42501', 'permission denied for function enregistrer_generation', 'la génération ne s''enregistre pas depuis le navigateur');
select throws_ok($$select * from public.demarrer_import(gen_random_uuid(), auth.uid())$$, '42501', 'permission denied for function demarrer_import', 'le statut n''avance pas depuis le navigateur');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is((select count(*)::int from public.courses), 0, 'un autre compte ne voit pas ce cours');

reset role;
insert into public.courses (id, owner, titre, format, statut) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'En cours', 'pdf', 'en_attente');
select is((select count(*)::int from public.demarrer_import('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a')), 0, 'on ne démarre pas le cours d''un autre');
select is((select statut from public.demarrer_import((select id from public.courses where titre = 'Cours'), '00000000-0000-0000-0000-00000000000a')), 'generation', 'un texte collé passe directement à la génération');
select is((select count(*)::int from public.demarrer_import((select id from public.courses where titre = 'Cours'), '00000000-0000-0000-0000-00000000000a')), 0, 'un import ne démarre pas deux fois');

-- Reprise : un import bloqué repart à son étape après 10 minutes, pas avant.
alter table public.courses disable trigger courses_touch_updated_at;
update public.courses set updated_at = now() - interval '9 minutes' where titre = 'Cours';
select is((select count(*)::int from public.demarrer_import((select id from public.courses where titre = 'Cours'), '00000000-0000-0000-0000-00000000000a')), 0, 'un import récent ne se relance pas');
update public.courses set updated_at = now() - interval '11 minutes' where titre = 'Cours';
select is((select statut from public.demarrer_import((select id from public.courses where titre = 'Cours'), '00000000-0000-0000-0000-00000000000a')), 'generation', 'un import bloqué reprend à son étape');
alter table public.courses enable trigger courses_touch_updated_at;

select public.enregistrer_generation(
  (select id from public.courses where titre = 'Cours'),
  '[{"titre":"N","ordre":0,"carte_recto":"r","carte_verso":"v","questions":[{"type":"vrai_faux","enonce":"E","extrait":"X","difficulte":"facile","presentation":{"options":["Vrai","Faux"]},"ordre":0,"reponse":{"correctes":[0]},"explication":"Parce que"}]}]',
  0.5
);
select public.enregistrer_generation((select id from public.courses where titre = 'Cours'), '[]', 0.5);
select is((select statut from public.courses where titre = 'Cours'), 'pret', 'la génération rend le cours prêt');
select is((select pretes from public.import_usage where owner = '00000000-0000-0000-0000-00000000000a'), 1, 'le quota n''est décompté qu''une fois');
select is(
  (select count(*)::int from public.answer_keys k join public.questions q on q.id = k.question_id where q.owner = '00000000-0000-0000-0000-00000000000a'),
  1, 'un second enregistrement n''efface pas le cours prêt'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
delete from public.questions;
select is((select count(*)::int from public.questions), 0, 'un compte supprime ses questions');

reset role;
update public.import_usage set pretes = 5 where owner = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select throws_ok($$select public.creer_import('Trop', 'texte', 'x')$$, 'SQ429', null, 'le quota du mois bloque un nouvel import');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
delete from public.courses;
select is((select count(*)::int from public.courses), 1, 'un import en cours ne se supprime pas');

reset role;
update public.courses set statut = 'a_relire' where id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select lives_ok($$select public.corriger_transcription('00000000-0000-0000-0000-0000000000b1', 'texte corrigé')$$, 'la relecture corrige le texte');
reset role;
update public.courses set statut = 'pret' where id = '00000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select throws_ok($$select public.corriger_transcription('00000000-0000-0000-0000-0000000000b1', 'trop tard')$$, 'SQ409', null, 'un cours prêt ne se corrige plus');

select * from finish();
rollback;
