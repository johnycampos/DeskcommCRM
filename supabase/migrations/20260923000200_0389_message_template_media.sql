-- 0389: anexo de mídia (imagens e vídeos) em templates de mensagem (Top Coworking).
-- Cada template pode ter N mídias hospedadas no bucket whatsapp-media.
-- RLS espelha estritamente message_templates: leitura por membros da org para
-- templates compartilhados ou próprios; escrita por agent (próprio) ou manager (compartilhado).

create table if not exists public.message_template_media (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.message_templates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null,
  media_mime text not null,
  media_size_bytes bigint not null,
  filename text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_message_template_media_template on public.message_template_media (template_id);
create index if not exists idx_message_template_media_org on public.message_template_media (organization_id);

alter table public.message_template_media enable row level security;

drop policy if exists "message_template_media_select" on public.message_template_media;
create policy "message_template_media_select" on public.message_template_media
  for select using (
    (
      organization_id in (select fn_user_org_ids())
      and exists (
        select 1 from public.message_templates t
        where t.id = message_template_media.template_id
          and (t.owner_user_id is null or t.owner_user_id = auth.uid())
      )
    )
    or fn_is_platform_admin()
  );

drop policy if exists "message_template_media_write" on public.message_template_media;
create policy "message_template_media_write" on public.message_template_media
  for all using (
    organization_id in (select fn_user_org_ids())
    and exists (
      select 1 from public.message_templates t
      where t.id = message_template_media.template_id
        and (
          (t.owner_user_id = auth.uid() and fn_role_at_least(t.organization_id, 'agent'))
          or (t.owner_user_id is null and fn_role_at_least(t.organization_id, 'manager'))
        )
    )
  )
  with check (
    organization_id in (select fn_user_org_ids())
    and exists (
      select 1 from public.message_templates t
      where t.id = message_template_media.template_id
        and (
          (t.owner_user_id = auth.uid() and fn_role_at_least(t.organization_id, 'agent'))
          or (t.owner_user_id is null and fn_role_at_least(t.organization_id, 'manager'))
        )
    )
  );

-- O `alter default privileges` do baseline concede tabela nova a `anon`; RLS já
-- barra anon (sem org própria, nenhuma policy casa), mas o revoke explícito é a
-- mesma defesa em profundidade que toda tabela nova deste apêndice aplica.
revoke all on public.message_template_media from anon;
