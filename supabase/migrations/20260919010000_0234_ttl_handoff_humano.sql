-- 0234 — TTL de 2 horas no handoff humano: "Assumir" cala o automático com prazo
-- finito, impedindo que esquecimento do atendente silencie o cliente para sempre.
--
-- ## O defeito
--
-- A migration 0173 introduziu o silêncio ao assumir (`bot_silenced_until = 'infinity'`).
-- Quando o atendente humano clica "Assumir", a conversa passava a ter silêncio infinito.
-- Se o atendente finalizava o atendimento mas esquecia de clicar em "Devolver ao automático",
-- o silêncio permanecia 'infinity' para sempre. No dia seguinte, quando o cliente voltava a
-- falar, o motor de IA lia `isLeadInHandoff` (`bot_silenced_until > now()` é sempre true para
-- 'infinity') e descartava o processamento com 'conversa_silenciada'.
--
-- ## O conserto
--
-- Substitui `'infinity'::timestamptz` por `now() + interval '2 hours'`.
-- Enquanto o atendente conversa, cada resposta enviada pelo CRM estende esse TTL por mais 2 horas.
-- Se houver inatividade de 2 horas do operador, a trava expira e a IA volta a responder o cliente.
-- A devolução explícita (`release`) continua limpando o silêncio imediatamente quando `last_handoff_at is null`.
--
-- Idempotente: `CREATE OR REPLACE FUNCTION`.
-- Forward-fix: converte eventuais 'infinity' residuais em 2 horas ou limpa se desatribuído.

CREATE OR REPLACE FUNCTION public.fn_conversation_assign(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_expected_assignee uuid DEFAULT NULL::uuid,
  p_enforce_expected boolean DEFAULT false
)
RETURNS SETOF public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;

  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;

  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for no key update;

  if not found then
    return;
  end if;

  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;

  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         assigned_to_user_name = case
           when p_to_user_id is null then null
           else (select raw_user_meta_data ->> 'full_name' from auth.users where id = p_to_user_id)
         end,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         -- TTL de 2 horas no handoff humano em vez de silêncio perpétuo 'infinity'.
         -- Ao liberar/desatribuir (p_to_user_id is null), limpa o silêncio incondicionalmente.
         bot_silenced_until = case
           when p_reason = 'routing'  then bot_silenced_until
           when p_to_user_id is null  then null
           else now() + interval '2 hours'
         end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;

  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);

  return next v_conv;
end;
$function$;

-- Limpeza defensiva de qualquer 'infinity' que ainda reste no banco
update public.conversations
   set bot_silenced_until = updated_at + interval '2 hours'
 where bot_silenced_until = 'infinity'::timestamptz
   and assigned_to_user_id is not null;

update public.conversations
   set bot_silenced_until = null
 where bot_silenced_until = 'infinity'::timestamptz
   and assigned_to_user_id is null;
