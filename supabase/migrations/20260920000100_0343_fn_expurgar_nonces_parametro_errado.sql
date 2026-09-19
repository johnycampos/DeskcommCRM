-- 0343: fn_expurgar_nonces_de_oauth nasceu (migration 0190) com parâmetros
-- `p_dias, p_lote` — diferente das três irmãs de retenção
-- (`fn_podar_fila_de_jobs`, `fn_expurgar_auditoria_vencida`,
-- `fn_expurgar_espelho_da_agenda`), que usam `p_retencao_dias, p_limite`.
--
-- O chamador único (`app/api/v1/cron/data-retention/route.ts`, função
-- `drenar`) invoca as QUATRO pelo MESMO nome de RPC com os MESMOS argumentos
-- nomeados (`p_retencao_dias`, `p_limite`) — está certo para as três
-- irmãs e nunca bateu com esta. PostgREST casa função por NOME + nomes de
-- argumento quando a chamada é por objeto nomeado (não por posição), e sem
-- overload compatível devolve "Could not find the function ... in the
-- schema cache" — medido em produção: a quarta poda do cron `data-retention`
-- falhava nesse passo a cada rodada, e as outras três nunca perceberam
-- porque `drenar` lança por poda individual, não pelo lote inteiro.
--
-- Forward-fix, doutrina de migrations: `create or replace` troca os nomes
-- de parâmetro sem precisar de `drop function` (tipo e ordem dos argumentos
-- não mudam), então é seguro re-aplicar num clone que já tinha a versão
-- antiga. Mantém o piso de 1 dia no CORPO, como a versão anterior.

create or replace function public.fn_expurgar_nonces_de_oauth(p_retencao_dias int default null, p_limite int default 500)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_dias int := greatest(coalesce(p_retencao_dias, 1), 1);
  v_limite int := greatest(coalesce(p_limite, 500), 1);
  v_removidas int;
begin
  with alvo as (
    select nonce
      from public.calendar_oauth_nonces
     where expira_em < now() - make_interval(days => v_dias)
     limit v_limite
  )
  delete from public.calendar_oauth_nonces n
   using alvo
   where n.nonce = alvo.nonce;

  get diagnostics v_removidas = row_count;
  return v_removidas;
end$$;

-- Mesma dupla origem de EXECUTE que a 0192 já corrigiu para esta função —
-- `create or replace` não apaga grants existentes, mas revogar de novo aqui
-- é barato e mantém este arquivo auto-suficiente (não depende de ler a 0192
-- antes para saber o estado final correto).
revoke execute on function public.fn_expurgar_nonces_de_oauth(int, int) from public, anon, authenticated;
grant execute on function public.fn_expurgar_nonces_de_oauth(int, int) to service_role;
