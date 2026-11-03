begin;
select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'a@example.test', '{"pseudo":"  Li​na  ","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-000000000002', 'b@example.test', '{"pseudo":"","declares_15_plus":true}');

select is((select pseudo from public.profiles where id = '00000000-0000-0000-0000-000000000001'), 'Lina', 'le pseudo est nettoyé');
select is((select pseudo from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'Joueur', 'un pseudo vide reçoit une valeur par défaut');
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000003', 'c@example.test', '{"pseudo":"x"}')$$,
  '23514', null, 'inscription refusée sans déclaration d''âge'
);
select throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000004', 'd@example.test', '{"pseudo":"x","declares_15_plus":false}')$$,
  '23514', null, 'inscription refusée si la déclaration est fausse'
);

set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'un visiteur ne lit aucun profil');
-- Le message compte : la fonction refuse aussi d'elle-même un appel sans compte, avec le même code.
select throws_ok($$select public.delete_my_account()$$, '42501', 'permission denied for function delete_my_account', 'un visiteur ne peut pas appeler la suppression');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.profiles), 1, 'un compte ne voit que son profil');
update public.profiles set pseudo = 'Piraté' where id = '00000000-0000-0000-0000-000000000002';
select throws_ok($$update public.profiles set declared_15_plus_at = now()$$, '42501', null, 'la déclaration d''âge n''est pas modifiable');
select throws_ok($$select public.handle_new_user()$$, '42501', 'permission denied for function handle_new_user', 'la fonction d''inscription n''est pas appelable');
select lives_ok($$select public.delete_my_account()$$, 'un compte peut se supprimer');

reset role;
select is((select pseudo from public.profiles where id = '00000000-0000-0000-0000-000000000002'), 'Joueur', 'le profil d''un autre compte reste intact');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000001'), 0, 'le compte supprimé a disparu');

select * from finish();
rollback;
