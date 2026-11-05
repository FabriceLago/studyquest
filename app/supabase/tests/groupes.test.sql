begin;
select no_plan();

-- A crée le groupe, B et C le rejoignent, D n'en fait pas partie.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'ga@example.test', '{"pseudo":"Ana","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000b1', 'gb@example.test', '{"pseudo":"Ben","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000c1', 'gc@example.test', '{"pseudo":"Cam","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000d1', 'gd@example.test', '{"pseudo":"Dan","declares_15_plus":true}');
create function pg_temp.g() returns uuid language sql security definer as $$
  select id from public.groups where nom = 'Terminale 2'
$$;
create function pg_temp.code() returns text language sql security definer as $$
  select code from public.groups where nom = 'Terminale 2'
$$;
create function pg_temp.serie(p_user uuid) returns int language sql security definer as $$
  select serie from public.serie_et_gels(p_user)
$$;
grant execute on function pg_temp.g() to authenticated;
grant execute on function pg_temp.code() to authenticated;
grant execute on function pg_temp.serie(uuid) to authenticated;
create function pg_temp.lundi() returns date language sql as $$
  select date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date
$$;
create function pg_temp.comme(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user)::text, true)
$$;

-- XP : A gagne 100 XP depuis lundi et 500 la semaine d'avant, B 30 aujourd'hui.
insert into public.daily_stats (owner, jour, xp, reviser_fait) values
  ('00000000-0000-0000-0000-0000000000a1', pg_temp.lundi(), 100, true),
  ('00000000-0000-0000-0000-0000000000a1', pg_temp.lundi() - 1, 500, true),
  ('00000000-0000-0000-0000-0000000000b1', (now() at time zone 'Europe/Paris')::date, 30, true);

select is((public.regles()).groupe_membres_max, 50, 'un groupe compte 50 membres au plus');

set local role anon;
select throws_ok($$select public.creer_groupe('X')$$, '42501', 'permission denied for function creer_groupe', 'un visiteur ne crée pas de groupe');
select throws_ok($$select public.classement_groupe(gen_random_uuid())$$, '42501', 'permission denied for function classement_groupe', 'un visiteur ne voit aucun classement');

set local role authenticated;
select pg_temp.comme('00000000-0000-0000-0000-0000000000a1');
select isnt(public.creer_groupe('Terminale 2'), null, 'A crée son groupe');
select matches(pg_temp.code(), '^[A-HJ-NP-Z2-9]{8}$', 'le code fait 8 signes sans 0, O, 1 ni I');
select throws_ok($$select public.creer_groupe('')$$, '23514', null, 'un nom vide est refusé');
select throws_ok($$select public.creer_groupe(E'Groupe‮')$$, '23514', null, 'un nom avec un caractère d''inversion est refusé');
select lives_ok($$select public.creer_groupe('G' || i) from generate_series(1, 9) i$$, 'A crée jusqu''à 10 groupes');
select throws_ok($$select public.creer_groupe('Un de trop')$$, 'SQ429', 'Nombre de groupes atteint.', 'pas plus de 10 groupes créés par compte');

-- Le groupe et son premier code, gardés pour la suite.
reset role;
create temp table t as select id, code from public.groups where nom = 'Terminale 2';
grant select on t to authenticated;
set local role authenticated;

select pg_temp.comme('00000000-0000-0000-0000-0000000000b1');
select is(public.rejoindre_groupe(lower(substr(pg_temp.code(), 1, 4) || '-' || substr(pg_temp.code(), 5))), pg_temp.g(), 'B entre avec le code, en minuscules et avec un tiret');
select is(public.rejoindre_groupe(pg_temp.code()), pg_temp.g(), 'entrer deux fois ne change rien');
select throws_ok($$select public.rejoindre_groupe('ZZZZZZZZ')$$, 'SQ404', 'Code inconnu.', 'un code inconnu est refusé');

-- Ce que B voit : pseudo, XP de la semaine et série, rien d'autre.
select is(jsonb_array_length(public.classement_groupe(pg_temp.g()) -> 'membres'), 2, 'le classement compte les deux membres');
select is(public.classement_groupe(pg_temp.g()) -> 'membres' -> 0 ->> 'pseudo', 'Ana', 'le plus d''XP de la semaine passe devant');
select is((public.classement_groupe(pg_temp.g()) -> 'membres' -> 0 ->> 'xp')::int, 100, 'l''XP d''avant lundi ne compte pas');
select is(
  (public.classement_groupe(pg_temp.g()) -> 'membres' -> 0 ->> 'serie')::int,
  pg_temp.serie('00000000-0000-0000-0000-0000000000a1'),
  'la série est celle du jour'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.classement_groupe(pg_temp.g()) -> 'membres' -> 0) k),
  array['id', 'moi', 'pseudo', 'serie', 'xp'],
  'aucune autre information sur un membre'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.classement_groupe(pg_temp.g()) -> 'membres') m where m -> 'id' <> 'null'::jsonb),
  0,
  'un membre ne reçoit l''identifiant de personne'
);
select is(public.classement_groupe(pg_temp.g()) -> 'membres' -> 1 ->> 'moi', 'true', 'B se reconnaît');
select is(public.classement_groupe(pg_temp.g()) ->> 'createur', 'false', 'B n''a pas créé le groupe');
select is((select count(*)::int from public.groups), 1, 'B lit seulement ses groupes');
select is((select count(*)::int from public.group_members), 1, 'B ne lit que sa propre adhésion');
select throws_ok($$select owner from public.groups$$, '42501', null, 'la personne qui a créé le groupe reste cachée');
select throws_ok($$select public.retirer_membre(pg_temp.g(), '00000000-0000-0000-0000-0000000000a1')$$, '42501', null, 'B ne retire personne');
select throws_ok($$select public.changer_code_groupe(pg_temp.g())$$, '42501', null, 'B ne change pas le code');
select throws_ok($$select public.supprimer_groupe(pg_temp.g())$$, '42501', null, 'B ne supprime pas le groupe');

select pg_temp.comme('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.classement_groupe(pg_temp.g())$$, 'SQ404', 'Groupe introuvable.', 'hors du groupe, pas de classement');
select is((select count(*)::int from public.groups), 0, 'hors du groupe, rien à lire');

select pg_temp.comme('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from jsonb_array_elements(public.classement_groupe(pg_temp.g()) -> 'membres') m where m -> 'id' = 'null'::jsonb),
  0,
  'la personne qui a créé le groupe reçoit les identifiants, pour modérer'
);

-- 50 membres au plus.
reset role;
insert into auth.users (id, email, raw_user_meta_data)
  select gen_random_uuid(), 'remplissage-' || i || '@example.test', '{"pseudo":"R","declares_15_plus":true}'
  from generate_series(1, 48) i;
insert into public.group_members (group_id, user_id)
  select pg_temp.g(), id from auth.users where email like 'remplissage-%@example.test';
set local role authenticated;
select pg_temp.comme('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.rejoindre_groupe(pg_temp.code())$$, 'SQ409', 'Ce groupe est complet.', 'le 51e membre est refusé');
select pg_temp.comme('00000000-0000-0000-0000-0000000000b1');
select is(public.rejoindre_groupe(pg_temp.code()), pg_temp.g(), 'un membre déjà présent n''est pas refusé');
reset role;
delete from public.group_members where user_id in (select id from auth.users where email like 'remplissage-%@example.test');
set local role authenticated;

-- Changer le code ferme l'ancien.
select pg_temp.comme('00000000-0000-0000-0000-0000000000a1');
select isnt(public.changer_code_groupe(pg_temp.g()), (select code from t), 'A tire un nouveau code');
select pg_temp.comme('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.rejoindre_groupe((select code from t))$$, 'SQ404', 'Code inconnu.', 'l''ancien code ne marche plus');
select is(public.rejoindre_groupe(pg_temp.code()), pg_temp.g(), 'le nouveau code marche');

-- Quitter, retirer, supprimer.
select pg_temp.comme('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.quitter_groupe(pg_temp.g())$$, 'B quitte le groupe');
select throws_ok($$select public.classement_groupe(pg_temp.g())$$, 'SQ404', 'Groupe introuvable.', 'après l''avoir quitté, B ne voit plus le classement');
select pg_temp.comme('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.quitter_groupe(pg_temp.g())$$, 'SQ409', 'Supprime le groupe pour le quitter.', 'A ne quitte pas son propre groupe');
select throws_ok($$select public.retirer_membre(pg_temp.g(), '00000000-0000-0000-0000-0000000000a1')$$, 'SQ409', 'Supprime le groupe pour le quitter.', 'A ne se retire pas');
select lives_ok($$select public.retirer_membre(pg_temp.g(), '00000000-0000-0000-0000-0000000000c1')$$, 'A retire C');
select is(jsonb_array_length(public.classement_groupe(pg_temp.g()) -> 'membres'), 1, 'C n''est plus dans le classement');

-- Avatars : A a 600 XP au total, soit le niveau 3.
select throws_ok($$update public.profiles set avatar = 7$$, '42501', null, 'l''avatar ne se change pas directement');
select lives_ok($$select public.choisir_avatar(4)$$, 'un avatar du niveau 3 est accepté au niveau 3');
select is((select avatar::int from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 4, 'l''avatar est enregistré');
select throws_ok($$select public.choisir_avatar(5)$$, 'SQ403', 'Avatar pas encore débloqué.', 'un avatar du niveau 4 est refusé');
select throws_ok($$select public.choisir_avatar(8)$$, 'SQ404', 'Avatar inconnu.', 'un avatar inconnu est refusé');
select throws_ok($$select public.choisir_avatar(-1)$$, 'SQ404', 'Avatar inconnu.', 'un numéro négatif est refusé');

select lives_ok($$select public.supprimer_groupe(pg_temp.g())$$, 'A supprime son groupe');
reset role;
select is((select count(*)::int from public.group_members where group_id = (select id from t)), 0, 'les adhésions partent avec le groupe');

select * from finish();
rollback;
