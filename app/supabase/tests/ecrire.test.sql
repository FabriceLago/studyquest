begin;
select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', '{"pseudo":"B","declares_15_plus":true}');
insert into public.courses (id, owner, titre, format, statut) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'Importé', 'texte', 'pret');

-- Un cours valide : choix unique, choix multiple et vrai/faux.
create function pg_temp.cours() returns jsonb language sql as $$ select $j$[
  {"titre": "Cellule", "a_retenir": "La cellule est l'unité du vivant.", "questions": [
    {"enonce": "Unité du vivant ?", "explication": "Vu en cours.", "choix": [
      {"texte": "Bonne", "correcte": true}, {"texte": "Fausse", "correcte": false}, {"texte": "Autre", "correcte": false}]},
    {"enonce": "Organites ?", "choix": [
      {"texte": "Noyau", "correcte": true}, {"texte": "Mitochondrie", "correcte": true}, {"texte": "Pixel", "correcte": false}]}
  ]},
  {"titre": "ADN", "a_retenir": "L'ADN porte l'information génétique.", "questions": [
    {"enonce": "L'ADN est une protéine.", "explication": null, "vrai": false}
  ]}
]$j$::jsonb $$;
-- Une notion d'une question, avec les choix et l'énoncé donnés.
create function pg_temp.une(
  p_choix jsonb default '[{"texte":"a","correcte":true},{"texte":"b","correcte":false}]',
  p_enonce text default 'E'
) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('titre', 'N', 'a_retenir', 'R', 'questions',
    jsonb_build_array(jsonb_build_object('enonce', p_enonce, 'choix', p_choix))))
$$;
-- Le cours de A : les parcours de bout en bout laissent d'autres « Biologie » dans la base locale.
create function pg_temp.bio() returns uuid language sql security definer as $$
  select id from public.courses where owner = '00000000-0000-0000-0000-00000000000a' and titre = 'Biologie' $$;
create function pg_temp.code() returns text language sql security definer as $$
  select code_partage from public.courses where id = pg_temp.bio() $$;
grant execute on function pg_temp.cours(), pg_temp.une(jsonb, text), pg_temp.bio(), pg_temp.code() to anon, authenticated;

set local role anon;
select throws_ok($$select public.ecrire_cours(null, 'T', pg_temp.cours())$$, '42501', 'permission denied for function ecrire_cours', 'un visiteur n''écrit rien');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select lives_ok($$select public.ecrire_cours(null, '  Biologie  ', pg_temp.cours())$$, 'un compte écrit un cours');
select is((select format || '/' || statut from public.courses where titre = 'Biologie'), 'manuel/pret', 'le cours est prêt tout de suite');
select is((select count(*)::int from public.notions), 2, 'ses notions sont enregistrées');
select is((select carte_recto || ' | ' || carte_verso from public.notions where titre = 'ADN'), 'ADN | L''ADN porte l''information génétique.', 'la carte reprend le titre et « À retenir »');
select is(
  (select array_agg(q.type order by n.ordre, q.ordre) from public.questions q join public.notions n on n.id = q.notion_id),
  array['unique', 'multiple', 'vrai_faux'], 'une, plusieurs ou vrai/faux donnent le bon type'
);
select is((select count(*)::int from public.questions where extrait <> ''), 0, 'aucune question ne cite d''extrait');
select is((select count(*)::int from public.import_usage), 0, 'le quota d''import ne bouge pas');
select throws_ok($$select * from public.answer_keys$$, '42501', null, 'les réponses restent illisibles depuis le navigateur');

-- Sans rôle, la base entière est visible : chaque requête se limite au compte A.
reset role;
select is(
  (select q.presentation -> 'options' ->> (k.reponse -> 'correctes' ->> 0)::int
   from public.questions q join public.answer_keys k on k.question_id = q.id
   where q.owner = '00000000-0000-0000-0000-00000000000a' and q.enonce = 'Unité du vivant ?'),
  'Bonne', 'la clé suit le mélange des choix'
);
select is(
  (select array_agg(q.presentation -> 'options' ->> c::int order by q.presentation -> 'options' ->> c::int)
   from public.questions q join public.answer_keys k on k.question_id = q.id, jsonb_array_elements_text(k.reponse -> 'correctes') c
   where q.owner = '00000000-0000-0000-0000-00000000000a' and q.enonce = 'Organites ?'),
  array['Mitochondrie', 'Noyau'], 'un choix multiple garde toutes ses bonnes réponses'
);
select is(
  (select q.presentation || k.reponse from public.questions q join public.answer_keys k on k.question_id = q.id
   where q.owner = '00000000-0000-0000-0000-00000000000a' and q.type = 'vrai_faux'),
  '{"options": ["Vrai", "Faux"], "correctes": [1]}'::jsonb, 'faux donne Vrai puis Faux, la bonne réponse en second'
);
select is(
  (select string_agg(k.explication, '|' order by q.ordre) from public.questions q
   join public.answer_keys k on k.question_id = q.id join public.notions n on n.id = q.notion_id
   where q.owner = '00000000-0000-0000-0000-00000000000a' and n.titre = 'Cellule'),
  'Vu en cours.|', 'l''explication est facultative'
);

set local role authenticated;
select lives_ok($$select public.ecrire_cours(pg_temp.bio(), null, pg_temp.une())$$, 'l''auteur ajoute une notion plus tard');
select is((select count(*) || '/' || max(ordre) from public.notions), '3/2', 'la notion ajoutée vient en dernier');

select throws_ok($$select public.ecrire_cours(null, 'X', pg_temp.une('[{"texte":"a","correcte":false},{"texte":"b","correcte":false}]'))$$, '22023', 'Coche au moins une bonne réponse.', 'il faut au moins une bonne réponse');
select throws_ok($$select public.ecrire_cours(null, 'X', pg_temp.une('[{"texte":"a","correcte":true}]'))$$, '22023', 'Choix invalides.', 'deux choix au moins');
select throws_ok($$select public.ecrire_cours(null, 'X', pg_temp.une((select jsonb_agg(jsonb_build_object('texte', 'c' || i, 'correcte', i = 1)) from generate_series(1, 7) i)))$$, '22023', 'Choix invalides.', 'six choix au plus');
select throws_ok($$select public.ecrire_cours(null, 'X', pg_temp.une('[{"texte":"a","correcte":true},{"texte":" A ","correcte":false}]'))$$, '22023', 'Choix invalides.', 'deux choix identiques sont refusés');
select throws_ok($$select public.ecrire_cours(null, 'X', pg_temp.une('[{"texte":"a","correcte":true},{"texte":"  ","correcte":false}]'))$$, '22023', 'Choix invalides.', 'un choix vide est refusé');
select throws_ok($$select public.ecrire_cours(null, 'X', '[{"titre":"N","a_retenir":"R","questions":[{"enonce":"E","vrai":true,"choix":[]}]}]')$$, '22023', 'Choix invalides.', 'un vrai/faux n''a pas de choix');
select throws_ok($$select public.ecrire_cours(null, 'X', pg_temp.une(p_enonce => repeat('x', 301)))$$, '22023', 'Question invalide.', 'un énoncé de 301 signes est refusé');
select throws_ok($$select public.ecrire_cours(null, '   ', pg_temp.une())$$, '22023', 'Titre invalide.', 'un cours a un titre');
select throws_ok($$select public.ecrire_cours(null, 'X', '[]')$$, '22023', 'Ajoute au moins une notion.', 'un cours a au moins une notion');
select throws_ok($$select public.ecrire_cours(null, 'X', '[{"titre":"N","a_retenir":"","questions":[{"enonce":"E","vrai":true}]}]')$$, '22023', 'Notion invalide.', 'une notion a quelque chose à retenir');
select throws_ok(
  $$select public.ecrire_cours(null, 'X', jsonb_build_array(jsonb_build_object('titre', 'N', 'a_retenir', 'R', 'questions',
    (select jsonb_agg(jsonb_build_object('enonce', 'E' || i, 'vrai', true)) from generate_series(1, 21) i))))$$,
  '22023', 'Notion invalide.', '20 questions par notion au plus'
);
select throws_ok(
  $$select public.ecrire_cours(pg_temp.bio(), null, (select jsonb_agg(pg_temp.une() -> 0) from generate_series(1, 10)))$$,
  'SQ429', 'Un cours compte 12 notions au plus.', '12 notions par cours au plus'
);
select is((select count(*)::int from public.courses), 1, 'un envoi refusé ne laisse rien');
select throws_ok($$select public.creer_import('X', 'manuel')$$, '23514', null, 'l''import ne crée pas de cours manuel en attente');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select throws_ok($$select public.ecrire_cours(pg_temp.bio(), null, pg_temp.une())$$, 'SQ404', 'Cours introuvable.', 'on n''écrit pas dans le cours d''un autre');
select throws_ok($$select public.ecrire_cours('00000000-0000-0000-0000-0000000000b1', null, pg_temp.une())$$, 'SQ404', 'Cours introuvable.', 'on n''ajoute rien à un cours importé');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select public.partager_cours(pg_temp.bio(), true);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select public.rejoindre_cours(pg_temp.code());
select is((select count(*)::int from public.questions), 4, 'une copie partagée reçoit toutes les questions');
select throws_ok(
  $$select public.ecrire_cours((select id from public.courses where partage_de is not null), null, pg_temp.une())$$,
  'SQ404', 'Cours introuvable.', 'une copie reçue ne s''enrichit pas'
);

reset role;
insert into public.courses (owner, titre, format, statut)
  select '00000000-0000-0000-0000-00000000000b', 'M' || i, 'manuel', 'pret' from generate_series(1, 100) i;
set local role authenticated;
select throws_ok($$select public.ecrire_cours(null, 'Encore', pg_temp.une())$$, 'SQ429', 'Tu as atteint 100 cours écrits à la main.', '100 cours écrits à la main au plus');

select * from finish();
rollback;
