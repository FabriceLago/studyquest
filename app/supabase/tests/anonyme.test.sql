-- Utilisation libre (ajout du 7 novembre 2026) : une session anonyme est un compte comme un autre.
begin;
select plan(5);

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', true, '{"declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000e2', true, '{"declares_15_plus":true}');

select is((select pseudo from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'Joueur', 'une session anonyme déclarée reçoit son profil');
select throws_ok(
  $$insert into auth.users (id, is_anonymous, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e3', true, '{}')$$,
  '23514', null, 'une session anonyme sans déclaration d''âge est refusée'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","is_anonymous":true}';
select is((select count(*)::int from public.profiles), 1, 'une session anonyme ne voit que son profil');
select lives_ok(
  $$select public.ecrire_cours(null, 'Histoire', '[{"titre":"N","a_retenir":"R","questions":[{"enonce":"E","vrai":true}]}]')$$,
  'une session anonyme écrit un cours'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","is_anonymous":true}';
select is((select count(*)::int from public.courses), 0, 'une autre session anonyme ne voit pas ce cours');

select * from finish();
rollback;
