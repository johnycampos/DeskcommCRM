/**
 * J12 — Mensagens Salvas e Scripts com Mídia no Cabeçalho da Conversa
 *
 * Exercita o fluxo de ponta a ponta:
 *   1. Criação/gestão de template com anexo de imagem/vídeo
 *   2. Abertura do modal "Mensagens salvas" no cabeçalho do Inbox
 *   3. Busca, visualização do preview de mídia e badges
 *   4. Envio direto da mensagem com mídia e interpolação de variáveis
 *   5. Validação da mensagem entregue na conversa
 *
 * Evidência salva em `.superpowers/evidence/saved-messages-media/`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), ".superpowers/evidence/saved-messages-media");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let creds: Creds;
let conversaId = "";
let contatoId = "";
let templateId = "";
let storagePath = "";
const TEMPLATE_TITLE = `Template E2E Mídia ${Date.now()}`;
const NOME_CONTATO = `Cliente Teste ${Date.now()}`;

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`), fullPage: true });
}

test.describe("J12 — Mensagens Salvas com Mídia no Inbox", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) {
      execFileSync("node", ["--import", "tsx", "scripts/seed-e2e-credentials.ts"], {
        stdio: "inherit",
        env: { ...process.env, ...env },
      });
    }
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf-8")) as Creds;

    // Garante que existe canal WAHA e conversa para o teste
    // Garante canal WAHA em status STOPPED para não tentar conexão externa não mockada
    let sessionId: string | undefined;
    const { data: session } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", creds.org_id)
      .limit(1)
      .maybeSingle();

    if (session) {
      sessionId = session.id;
      await admin.from("channel_sessions").update({ status: "STOPPED" }).eq("id", sessionId);
    } else {
      const { data: newSess, error: sessErr } = await admin
        .from("channel_sessions")
        .insert({
          organization_id: creds.org_id,
          provider: "waha",
          waha_session_name: `e2e_${Date.now()}`,
          webhook_secret_encrypted: "\\x00",
          status: "STOPPED",
        })
        .select("id")
        .single();
      if (sessErr) throw new Error(`Falha ao criar canal de teste: ${sessErr.message}`);
      sessionId = newSess!.id;
    }

    const { data: contato, error: contErr } = await admin
      .from("contacts")
      .insert({
        organization_id: creds.org_id,
        name: NOME_CONTATO,
        display_name: NOME_CONTATO,
        phone_number: `+553199999${Math.floor(Math.random() * 8999 + 1000)}`,
      })
      .select("id")
      .single();
    if (contErr) throw new Error(`Falha ao criar contato de teste: ${contErr.message}`);
    contatoId = contato!.id;

    const agora = new Date().toISOString();
    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .insert({
        organization_id: creds.org_id,
        contact_id: contatoId,
        channel_session_id: sessionId,
        status: "open",
        last_inbound_at: agora,
        last_message_at: agora,
        last_message_preview: "Conversa de teste de mensagens salvas",
      })
      .select("id")
      .single();
    if (convErr) throw new Error(`Falha ao criar conversa de teste: ${convErr.message}`);
    conversaId = conv!.id;

    const user = (creds.users.owner ?? creds.users.manager ?? creds.users.admin)!;

    // Sobe arquivo real para o bucket whatsapp-media no Storage
    storagePath = `${creds.org_id}/message-template-media/e2e-demo-${Date.now()}.png`;
    const fakePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    await admin.storage
      .from("whatsapp-media")
      .upload(storagePath, fakePng, { contentType: "image/png", upsert: true });

    // Semeia template com anexo de mídia no banco
    const { data: tpl } = await admin
      .from("message_templates")
      .insert({
        organization_id: creds.org_id,
        title: TEMPLATE_TITLE,
        body: "Olá {{nome}}, segue a foto do nosso espaço de coworking!",
        shortcut: `coworking_${Date.now().toString().slice(-4)}`,
        created_by_user_id: user.id,
      })
      .select("id")
      .single();
    templateId = tpl!.id;

    await admin.from("message_template_media").insert({
      template_id: templateId,
      organization_id: creds.org_id,
      storage_path: storagePath,
      media_mime: "image/png",
      media_size_bytes: fakePng.length,
      filename: "coworking-mesa-privativa.png",
      position: 0,
    });
  });

  test.afterAll(async () => {
    if (storagePath) {
      await admin.storage.from("whatsapp-media").remove([storagePath]);
    }
    if (templateId) {
      await admin.from("message_template_media").delete().eq("template_id", templateId);
      await admin.from("message_templates").delete().eq("id", templateId);
    }
    if (conversaId) {
      await admin.from("messages").delete().eq("conversation_id", conversaId);
      await admin.from("conversations").delete().eq("id", conversaId);
    }
    if (contatoId) {
      await admin.from("contacts").delete().eq("id", contatoId);
    }
  });

  test("J12.1 — Abrir modal de mensagens salvas pelo cabeçalho, buscar e ver anexo com preview", async ({ page }) => {
    const user = (creds.users.owner ?? creds.users.manager ?? creds.users.admin)!;
    await login(page, user.email, creds.password);

    await page.goto(`/app/inbox/${conversaId}`);
    await page.waitForSelector("[data-conversation-id]", { timeout: 30_000 }).catch(() => null);

    // Clica no botão "Mensagens salvas" no cabeçalho
    const savedMsgBtn = page.getByTestId("botao-mensagens-salvas");
    await expect(savedMsgBtn).toBeVisible({ timeout: 15_000 });
    await savedMsgBtn.click();

    // Dialog aberto
    await expect(page.getByRole("dialog")).toBeVisible();
    await captura(page, "01-dialog-mensagens-salvas-aberto");

    // Digita no campo de busca o título do template
    const searchInput = page.getByPlaceholder(/buscar por título, atalho ou texto/i);
    await searchInput.fill(TEMPLATE_TITLE);

    // Confere se o template filtrado aparece com badge de mídia e preview do arquivo
    await expect(page.getByText(TEMPLATE_TITLE)).toBeVisible();
    await expect(page.getByText(/1 anexo/i)).toBeVisible();
    await expect(page.getByText("coworking-mesa-privativa.png")).toBeVisible();
    await captura(page, "02-template-com-midia-filtrado");
  });

  test("J12.2 — Enviar mensagem salva com mídia e validar entrega com interpolação", async ({ page }) => {
    const user = (creds.users.owner ?? creds.users.manager ?? creds.users.admin)!;
    await login(page, user.email, creds.password);

    await page.goto(`/app/inbox/${conversaId}`);
    await page.waitForSelector("[data-conversation-id]", { timeout: 30_000 }).catch(() => null);
    const savedMsgBtn = page.getByTestId("botao-mensagens-salvas");
    await expect(savedMsgBtn).toBeVisible({ timeout: 20_000 });
    await savedMsgBtn.click();

    const searchInput = page.getByPlaceholder(/buscar por título, atalho ou texto/i);
    await searchInput.fill(TEMPLATE_TITLE);

    // Clica no botão Enviar do template
    const sendBtn = page.getByRole("button", { name: /^enviar$/i }).first();
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // Dialog fecha após envio bem-sucedido
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 15_000 });
    await captura(page, "03-apos-envio-direto");

    // Confere no banco se a mensagem foi gravada com media_storage_path correto e status válido
    const { data: sentMsg } = await admin
      .from("messages")
      .select("id, type, body, media_storage_path, media_mime, status")
      .eq("conversation_id", conversaId)
      .eq("type", "image")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(sentMsg).toBeTruthy();
    expect(sentMsg?.media_storage_path).toContain(`${creds.org_id}/message-template-media/`);
    expect(sentMsg?.body).toContain(NOME_CONTATO);
    expect(sentMsg?.status).not.toBe("failed");
  });
});
