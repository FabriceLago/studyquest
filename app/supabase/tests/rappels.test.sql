begin;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'rap-a@example.test', '{"pseudo":"A","declares_15_plus":true}'),
  ('00000000-0000-0000-0000-0000000000f2', 'rap-b@example.test', '{"pseudo":"B","declares_15_plus":true}');
-- Une heure donnée, heure de Paris, aujourd'hui.
create function pg_temp.a(p_heure text) returns timestamptz language sql as $$
  select ((now() at time zone 'Europe/Paris')::date + p_heure::time) at time zone 'Europe/Paris'
$$;
create function pg_temp.envoyes(p_heure text) returns int language sql as $$
  select count(*)::int from public.rappels_a_envoyer(pg_temp.a(p_heure))
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1"}';
select lives_ok($$update public.profiles set rappel = '10:00' where id = auth.uid()$$, 'on règle son heure de rappel');
select throws_ok($$update public.profiles set rappel = '23:30' where id = auth.uid()$$, '23514', null, 'pas de rappel la nuit');
select throws_ok($$update public.profiles set rappel_envoye = current_date where id = auth.uid()$$, '42501', null, 'la date d''envoi n''est pas modifiable');
select lives_ok($$select public.enregistrer_push('https://fcm.googleapis.com/fcm/send/a', 'cle', 'secret')$$, 'on enregistre son navigateur');
select throws_ok($$insert into public.push_subscriptions (owner, endpoint, p256dh, auth) values (auth.uid(), 'https://x', 'k', 'a')$$, '42501', null, 'pas d''écriture directe');
select throws_ok($$select public.rappels_a_envoyer()$$, '42501', null, 'le choix des rappels reste au serveur');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2"}';
select is((select count(*)::int from public.push_subscriptions), 0, 'on ne voit pas les navigateurs d''un autre');
select lives_ok($$select public.enregistrer_push('https://fcm.googleapis.com/fcm/send/a', 'cle2', 'secret2')$$, 'le même navigateur passe à un autre compte');
select is((select count(*)::int from public.push_subscriptions), 1, 'il est maintenant à B');
select lives_ok($$delete from public.push_subscriptions$$, 'B retire son navigateur');
reset role;

-- A a un navigateur et un rappel à 10 h.
insert into public.push_subscriptions (owner, endpoint, p256dh, auth) values
  ('00000000-0000-0000-0000-0000000000f1', 'https://fcm.googleapis.com/fcm/send/a2', 'k', 'a');
select is(pg_temp.envoyes('09:59'), 0, 'rien avant l''heure');
select is(pg_temp.envoyes('11:00'), 0, 'rien plus d''une heure après');
select is(pg_temp.envoyes('10:05'), 1, 'le rappel part à l''heure choisie');
select is(pg_temp.envoyes('10:20'), 0, 'un seul rappel par jour');

update public.profiles set rappel_envoye = null where id = '00000000-0000-0000-0000-0000000000f1';
insert into public.daily_stats (owner, jour, mini_fait) values ('00000000-0000-0000-0000-0000000000f1', (now() at time zone 'Europe/Paris')::date, true);
select is(pg_temp.envoyes('10:05'), 0, 'pas de rappel quand une mission est déjà faite');

update public.daily_stats set mini_fait = false where owner = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set rappel = null where id = '00000000-0000-0000-0000-0000000000f1';
select is(pg_temp.envoyes('10:05'), 0, 'rappel arrêté : rien ne part');

select is((select count(*)::int from cron.job where jobname = 'rappels' and schedule = '*/15 * * * *'), 1, 'l''envoi est planifié toutes les 15 minutes');
select lives_ok($$select public.declencher_rappels()$$, 'sans adresse dans le coffre, le déclenchement ne fait rien');

select * from finish();
rollback;
