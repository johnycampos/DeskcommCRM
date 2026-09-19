# Diretrizes do Gemini / Antigravity CLI — DeskcommCRM

## 1. Uso Obrigatório do Graphify antes de Alterações de Código

O repositório possui um Grafo de Conhecimento e Dependências gerado pelo **Graphify** localizado em `graphify-out/`.

Antes de realizar alterações de arquitetura, refatorações, criação ou modificação de rotas (`app/api/v1/`), serviços (`lib/`), workers ou componentes de UI, você **DEVE consultar o grafo de conhecimento** para entender as conexões, chamadores, dependências e comunidades afetadas.

### Como consultar o Grafo

1. **Via CLI Graphify (rápido e direto):**
   ```bash
   # Executar query semântica e estrutural no grafo existente:
   graphify query "<termo, símbolo ou pergunta>"
   
   # Exemplo:
   graphify query "createAdminClient"
   graphify query "quais rotas chamam sendMessageHandler"
   
   # Caminho mais curto entre dois nós/módulos:
   graphify path "sendMessageHandler" "createAdminClient"
   
   # Explicação de um nó específico:
   graphify explain "fn_conversation_assign"
   ```

2. **Via Arquivos em `graphify-out/`:**
   - [`graphify-out/GRAPH_REPORT.md`](file:///D:/desenvolvimento/whatsappCoworking/DeskcommCRM/graphify-out/GRAPH_REPORT.md): Relatório com God Nodes, conexões surpreendentes e comunidades.
   - [`graphify-out/graph.json`](file:///D:/desenvolvimento/whatsappCoworking/DeskcommCRM/graphify-out/graph.json): Grafo completo estruturado com 10.847+ nós e 37.621+ arestas.
   - [`graphify-out/graph.html`](file:///D:/desenvolvimento/whatsappCoworking/DeskcommCRM/graphify-out/graph.html): Visualização interativa.

3. **Atualização do Grafo após Mudanças:**
   Após criar ou refatorar arquivos de lógica de negócio (`lib/`, `app/`, `components/`, `hooks/`), execute:
   ```bash
   graphify . --update
   ```

---

## 2. God Nodes e Nós Críticos do DeskcommCRM

Ao alterar qualquer um destes nós centrais mapeados pelo Graphify, tome cuidado extremo com regressões em cascata:

1. **`createAdminClient()`** (`lib/supabase/admin.ts`):
   - **545 conexões**. É o nó-ponte entre quase todas as rotas `app/api/v1/` e os submódulos de negócio (`lib/agent-engine`, `lib/ai`, `lib/channels`, `lib/lgpd`). Bypassa RLS — sempre exija `organization_id` explícito nas queries.
2. **`useT()` / `traduzir()`** (i18n):
   - **770 / 492 conexões**. Central para internacionalização de todas as telas e mensagens.
3. **`ok()` / `fail()`** (`lib/api/wrappers.ts`):
   - **561 / 532 conexões**. Padronização canônica de respostas REST da API. Nunca monte `Response` cru na borda.
4. **`requireRole()`** (`lib/auth/require-role.ts`):
   - **437 conexões**. Guard canônico de RBAC.
5. **`audit()`** (`lib/audit/index.ts`):
   - **462 conexões**. Trilha de auditoria em mutações.

---

## 3. Contrato Geral

Siga rigorosamente as regras de segurança, migrations e Definition of Done descritas em [`AGENTS.md`](AGENTS.md) e [`CLAUDE.md`](CLAUDE.md).
