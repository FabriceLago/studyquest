-- Cours tapé à la main (ajout du 7 novembre 2026, docs/superpowers/specs/2026-11-07-cours-a-la-main.md) :
-- l'élève écrit ses notions et ses questions. Ni IA ni quota d'import ; les réponses restent dans
-- answer_keys, illisibles par le navigateur, comme pour un import.

alter table public.courses drop constraint courses_format_check;
alter table public.courses add constraint courses_format_check
  check (format in ('pdf', 'photos', 'texte', 'manuel'));
-- Un cours manuel est prêt dès sa création : creer_import ne peut pas en ouvrir un en attente.
alter table public.courses add constraint courses_manuel_pret check (format <> 'manuel' or statut = 'pret');

-- Les valeurs chiffrées restent au même endroit : regles() reçoit les limites des cours manuels.
drop function public.regles();
create function public.regles(
  out reviser_max int,
  out decouvrir_max int,
  out defi_min_vues int,
  out defi_secondes int,
  out defi_marge_secondes int,
  out xp_due int,
  out xp_nouvelle int,
  out xp_defi int,
  out xp_mission int,
  out xp_plafond int,
  out gels_par_mois int,
  out intervalles int[],
  out mini_questions int,
  out examen_blanc_questions int,
  out examen_blanc_secondes_par_question int,
  out partage_max int,
  out duel_questions int,
  out duel_secondes_par_question int,
  out duels_par_jour int,
  out groupe_membres_max int,
  out groupes_par_compte int,
  -- Niveau requis pour chacun des 8 avatars, dans l'ordre de src/app/core/avatars.ts.
  out avatars_niveaux int[],
  -- Cours manuels, repris dans ECRITURE (src/app/core/cours/cours.service.ts) pour le formulaire.
  out manuel_cours_max int,
  out manuel_notions_max int,
  out manuel_questions_max int,
  out manuel_choix_max int,
  out manuel_enonce_max int,
  out manuel_choix_longueur int,
  out manuel_texte_max int
)
language sql
immutable
set search_path = ''
as $$ select 15, 8, 5, 60, 5, 10, 5, 2, 20, 300, 2, array[1, 3, 7, 14, 30], 3, 20, 60, 50, 10, 30, 3, 50, 10, array[1, 1, 1, 2, 3, 4, 5, 6], 100, 12, 20, 6, 300, 150, 300 $$;
revoke execute on function public.regles() from public, anon, authenticated;

-- Crée un cours manuel (p_cours nul) ou ajoute des notions à l'un d'eux. Tout ou rien : la moindre
-- donnée invalide annule l'appel. Forme attendue, contrôlée ici et pas seulement dans le navigateur :
-- [{ titre, a_retenir, questions: [{ enonce, explication?, vrai } | { enonce, explication?, choix: [{ texte, correcte }] }] }]
create function public.ecrire_cours(p_cours uuid, p_titre text, p_notions jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  r record;
  v_cours uuid := p_cours;
  v_ordre int;
  v_nb int;
  v_notion uuid;
  v_question uuid;
  v_type text;
  v_options jsonb;
  v_correctes jsonb;
  n jsonb;
  q jsonb;
  i int;
begin
  if v_user is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  select * into r from public.regles();
  if jsonb_typeof(p_notions) is distinct from 'array' or jsonb_array_length(p_notions) = 0 then
    raise exception 'Ajoute au moins une notion.' using errcode = '22023';
  end if;
  -- Même verrou que creer_import : deux envois simultanés ne dépassent pas les limites.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if v_cours is null then
    if char_length(btrim(coalesce(p_titre, ''))) not between 1 and 120 then
      raise exception 'Titre invalide.' using errcode = '22023';
    end if;
    if (select count(*) from public.courses where owner = v_user and format = 'manuel' and partage_de is null)
        >= r.manuel_cours_max then
      raise exception 'Tu as atteint % cours écrits à la main.', r.manuel_cours_max using errcode = 'SQ429';
    end if;
    insert into public.courses (owner, titre, format, statut)
      values (v_user, btrim(p_titre), 'manuel', 'pret')
      returning id into v_cours;
  else
    -- Une copie reçue par un code ne s'enrichit pas : seul l'auteur ajoute des notions.
    perform 1 from public.courses
      where id = v_cours and owner = v_user and format = 'manuel' and partage_de is null
      for update;
    if not found then
      raise exception 'Cours introuvable.' using errcode = 'SQ404';
    end if;
  end if;

  select coalesce(max(ordre) + 1, 0), count(*) into v_ordre, v_nb from public.notions where course_id = v_cours;
  if v_nb + jsonb_array_length(p_notions) > r.manuel_notions_max then
    raise exception 'Un cours compte % notions au plus.', r.manuel_notions_max using errcode = 'SQ429';
  end if;

  for n in select * from jsonb_array_elements(p_notions) loop
    -- Contrôles imbriqués : une fonction de tableau sur un autre type lèverait une erreur obscure.
    if jsonb_typeof(n -> 'titre') is distinct from 'string'
      or jsonb_typeof(n -> 'a_retenir') is distinct from 'string'
      or jsonb_typeof(n -> 'questions') is distinct from 'array' then
      raise exception 'Notion invalide.' using errcode = '22023';
    end if;
    if char_length(btrim(n ->> 'titre')) not between 1 and 120
      or char_length(btrim(n ->> 'a_retenir')) not between 1 and r.manuel_texte_max
      or jsonb_array_length(n -> 'questions') not between 1 and r.manuel_questions_max then
      raise exception 'Notion invalide.' using errcode = '22023';
    end if;
    -- La carte de la notion : son titre au recto, ce qu'il faut en retenir au verso.
    insert into public.notions (course_id, owner, titre, ordre, carte_recto, carte_verso)
      values (v_cours, v_user, btrim(n ->> 'titre'), v_ordre, btrim(n ->> 'titre'), btrim(n ->> 'a_retenir'))
      returning id into v_notion;
    v_ordre := v_ordre + 1;
    i := 0;

    for q in select * from jsonb_array_elements(n -> 'questions') loop
      if jsonb_typeof(q -> 'enonce') is distinct from 'string'
        or coalesce(jsonb_typeof(q -> 'explication'), 'null') not in ('string', 'null') then
        raise exception 'Question invalide.' using errcode = '22023';
      end if;
      if char_length(btrim(q ->> 'enonce')) not between 1 and r.manuel_enonce_max
        or char_length(btrim(coalesce(q ->> 'explication', ''))) > r.manuel_texte_max then
        raise exception 'Question invalide.' using errcode = '22023';
      end if;

      if jsonb_typeof(q -> 'vrai') = 'boolean' and not q ? 'choix' then
        v_type := 'vrai_faux';
        v_options := '["Vrai", "Faux"]';
        v_correctes := case when (q ->> 'vrai')::boolean then '[0]'::jsonb else '[1]'::jsonb end;
      else
        if jsonb_typeof(q -> 'choix') is distinct from 'array' or q ? 'vrai' then
          raise exception 'Choix invalides.' using errcode = '22023';
        end if;
        if jsonb_array_length(q -> 'choix') not between 2 and r.manuel_choix_max
          or exists (
            select 1 from jsonb_array_elements(q -> 'choix') e
            where jsonb_typeof(e -> 'texte') is distinct from 'string'
              or jsonb_typeof(e -> 'correcte') is distinct from 'boolean'
          ) then
          raise exception 'Choix invalides.' using errcode = '22023';
        end if;
        if exists (
            select 1 from jsonb_array_elements(q -> 'choix') e
            where char_length(btrim(e ->> 'texte')) not between 1 and r.manuel_choix_longueur
          )
          or (select count(distinct lower(btrim(e ->> 'texte'))) from jsonb_array_elements(q -> 'choix') e)
            <> jsonb_array_length(q -> 'choix') then
          raise exception 'Choix invalides.' using errcode = '22023';
        end if;
        select count(*) filter (where (e ->> 'correcte')::boolean) into v_nb from jsonb_array_elements(q -> 'choix') e;
        if v_nb = 0 then
          raise exception 'Coche au moins une bonne réponse.' using errcode = '22023';
        end if;
        v_type := case when v_nb = 1 then 'unique' else 'multiple' end;
        -- Mélangés comme à l'import : la position ne trahit pas la réponse d'une copie partagée.
        with m as (
          select btrim(e ->> 'texte') as texte, (e ->> 'correcte')::boolean as correcte,
            row_number() over (order by random()) - 1 as rang
          from jsonb_array_elements(q -> 'choix') e
        )
        select jsonb_agg(to_jsonb(m.texte) order by m.rang), jsonb_agg(m.rang order by m.rang) filter (where m.correcte)
          into v_options, v_correctes
          from m;
      end if;

      -- Pas d'extrait : la question ne cite aucun document, l'écran ne l'affiche pas.
      insert into public.questions (notion_id, owner, type, enonce, extrait, difficulte, presentation, ordre)
        values (v_notion, v_user, v_type, btrim(q ->> 'enonce'), '', 'moyen', jsonb_build_object('options', v_options), i)
        returning id into v_question;
      insert into public.answer_keys (question_id, reponse, explication)
        values (v_question, jsonb_build_object('correctes', v_correctes), btrim(coalesce(q ->> 'explication', '')));
      i := i + 1;
    end loop;
  end loop;
  return v_cours;
end;
$$;

revoke execute on function public.ecrire_cours(uuid, text, jsonb) from public, anon;
grant execute on function public.ecrire_cours(uuid, text, jsonb) to authenticated;
