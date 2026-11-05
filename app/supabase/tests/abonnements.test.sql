begin;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'abo-a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000e2', 'abo-b@example.test', '{"pseudo":"B","declares_15_plus":true}');
insert into public.subscriptions (user_id, stripe_customer_id, status, current_period_end) values
  ('00000000-0000-0000-0000-0000000000e1', 'cus_a', 'active', now() + interval '20 days');

create function pg_temp.statut(p_status text, p_fin timestamptz, p_resilie boolean default false) returns void language sql as $$
  update public.subscriptions set status = p_status, current_period_end = p_fin, cancel_at_period_end = p_resilie
    where user_id = '00000000-0000-0000-0000-0000000000e1'
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
select is(public.quota_imports_mensuel(), 30, 'abonné : 30 imports par mois');
select is((select count(*)::int from public.subscriptions), 1, 'on lit son abonnement');
select throws_ok($$update public.subscriptions set status = 'active'$$, '42501', null, 'le navigateur ne modifie pas l''abonnement');
select throws_ok($$insert into public.subscriptions (user_id, stripe_customer_id, status) values ('00000000-0000-0000-0000-0000000000e2', 'cus_x', 'active')$$, '42501', null, 'ni n''en crée un');
select throws_ok($$select public.abonne('00000000-0000-0000-0000-0000000000e1')$$, '42501', null, 'abonne() reste réservée au serveur');
select throws_ok($$select public.delete_my_account()$$, 'SQ409', 'Résilie d’abord ton abonnement.', 'un compte encore facturé ne se supprime pas');

reset role;
select pg_temp.statut('past_due', now() + interval '20 days');
set local role authenticated;
select is(public.quota_imports_mensuel(), 30, 'paiement refusé que Stripe retente : le quota reste');

reset role;
select pg_temp.statut('canceled', now() + interval '20 days');
set local role authenticated;
select is(public.quota_imports_mensuel(), 5, 'abonnement résilié : quota gratuit');

reset role;
select pg_temp.statut('active', now() - interval '1 day');
set local role authenticated;
select is(public.quota_imports_mensuel(), 5, 'période terminée : quota gratuit');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2"}';
select is(public.quota_imports_mensuel(), 5, 'sans abonnement : 5 imports par mois');
select is((select count(*)::int from public.subscriptions), 0, 'on ne lit pas l''abonnement d''un autre');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1"}';
reset role;
select pg_temp.statut('active', now() + interval '20 days', true);
set local role authenticated;
select lives_ok($$select public.delete_my_account()$$, 'un abonnement résilié en fin de période n''empêche pas la suppression');
reset role;
select is((select count(*)::int from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000000e1'), 0, 'l''abonnement part avec le compte');

select * from finish();
rollback;
