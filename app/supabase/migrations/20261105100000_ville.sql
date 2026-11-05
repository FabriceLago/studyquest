-- La ville : une notion maîtrisée devient un bâtiment. Un bâtiment n'est jamais détruit : une question
-- qui retombe en boîte 1 ajoute seulement un repère « à revoir ».

alter table public.notions add column batie_at timestamptz;

-- Toutes les questions de la notion en boîte 3 ou plus : le bâtiment est posé, une fois pour toutes.
create function public.batir_notion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.boite >= 3 then
    update public.notions n set batie_at = now()
      where n.id = (select notion_id from public.questions where id = new.question_id)
        and n.batie_at is null
        and not exists (
          select 1 from public.questions q
          left join public.reviews r on r.question_id = q.id and r.owner = new.owner
          where q.notion_id = n.id and coalesce(r.boite, 0) < 3
        );
  end if;
  return null;
end;
$$;

create trigger reviews_batir
  after insert or update of boite on public.reviews
  for each row execute function public.batir_notion();

-- Un quartier par cours, dans l'ordre d'import, avec l'état de chaque notion.
create function public.ma_ville()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'titre', c.titre,
    'notions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id,
        'titre', n.titre,
        'ordre', n.ordre,
        'etat', case
          when n.batie_at is not null then 'batie'
          when exists (
            select 1 from public.questions q
            join public.reviews r on r.question_id = q.id and r.owner = n.owner
            where q.notion_id = n.id
          ) then 'chantier'
          else 'vide'
        end,
        'due', exists (
          select 1 from public.questions q
          join public.reviews r on r.question_id = q.id and r.owner = n.owner
          where q.notion_id = n.id and r.echeance <= public.jour_paris()
        ),
        'recent', coalesce(n.batie_at > now() - interval '1 day', false)
      ) order by n.ordre), '[]')
      from public.notions n
      where n.course_id = c.id
    )
  ) order by c.created_at, c.id), '[]')
  from public.courses c
  where c.owner = auth.uid() and c.statut = 'pret'
$$;

revoke execute on function public.batir_notion() from public, anon, authenticated;
revoke execute on function public.ma_ville() from public, anon;
grant execute on function public.ma_ville() to authenticated;
