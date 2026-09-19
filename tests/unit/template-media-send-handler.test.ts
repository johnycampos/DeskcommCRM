import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { isMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";
import type { SendMessageInput } from "@/lib/schemas";
import { criarDubleDoHandler, type LinhaDoDuble } from "@/tests/helpers/duble-do-handler";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const OTHER_USER = "66666666-6666-4666-8666-666666666666";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://signed.example/media.jpg" },
          error: null,
        }),
      }),
    },
  }),
}));

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

function conversationRow(): LinhaDoDuble {
  return {
    id: CONV,
    organization_id: ORG,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: false,
    group_chat_id: null,
    contacts: {
      phone_number: "+5531999998888",
      wa_identity: null,
      is_blocked: false,
    },
    channel_sessions: {
      provider: "waha",
      waha_session_name: "default",
      status: "WORKING",
      archived_at: null,
    },
  };
}

const baseCtx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: USER, role: "agent" },
  requestId: "req-test-1",
  idioma: "pt-BR",
};

describe("isMediaPathOwnedBy — validação sintática do path", () => {
  const orgId = "org-123";
  const convId = "conv-456";

  it("permite mídia de conversa da mesma org e conversa", () => {
    expect(isMediaPathOwnedBy(`${orgId}/${convId}/foto.jpg`, orgId, convId)).toBe(true);
  });

  it("permite mídia de template da mesma org em qualquer conversa da org", () => {
    expect(isMediaPathOwnedBy(`${orgId}/message-template-media/uuid-1.png`, orgId, convId)).toBe(true);
    expect(isMediaPathOwnedBy(`${orgId}/message-template-media/sub/video.mp4`, orgId, convId)).toBe(true);
  });

  it("bloqueia mídia de template de outra org", () => {
    expect(isMediaPathOwnedBy("outra-org/message-template-media/uuid-1.png", orgId, convId)).toBe(false);
  });

  it("bloqueia mídia de conversa de outra org ou conversa", () => {
    expect(isMediaPathOwnedBy("outra-org/conv-456/foto.jpg", orgId, convId)).toBe(false);
    expect(isMediaPathOwnedBy(`${orgId}/outra-conv/foto.jpg`, orgId, convId)).toBe(false);
  });

  it("bloqueia prefixos com confusão de nome", () => {
    expect(isMediaPathOwnedBy(`${orgId}x/message-template-media/uuid-1.png`, orgId, convId)).toBe(false);
    expect(isMediaPathOwnedBy(`${orgId}x/${convId}/foto.jpg`, orgId, convId)).toBe(false);
  });
});

describe("sendMessageHandler — Segurança no Envio de Mídia de Template", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const templateStoragePath = `${ORG}/message-template-media/img-123.jpg`;

  it("permite envio de mídia de template compartilhado (owner_user_id = null)", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: { _serialized: "W1" } })));

    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: {
        id: "media-1",
        template_id: "tpl-shared",
        storage_path: templateStoragePath,
        organization_id: ORG,
        message_templates: {
          id: "tpl-shared",
          organization_id: ORG,
          owner_user_id: null,
        },
      },
    });

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: templateStoragePath,
      media_mime: "image/jpeg",
      body: "Legenda do template",
    };

    const result = await sendMessageHandler(supabase, baseCtx, input);
    expect(result.status).toBe("sent");
    expect(result.media_storage_path).toBe(templateStoragePath);
  });

  it("permite envio de mídia de template pessoal do próprio usuário (owner_user_id = USER)", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: { _serialized: "W2" } })));

    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: {
        id: "media-2",
        template_id: "tpl-own",
        storage_path: templateStoragePath,
        organization_id: ORG,
        message_templates: {
          id: "tpl-own",
          organization_id: ORG,
          owner_user_id: USER,
        },
      },
    });

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: templateStoragePath,
      media_mime: "image/jpeg",
      body: "Meu template",
    };

    const result = await sendMessageHandler(supabase, baseCtx, input);
    expect(result.status).toBe("sent");
  });

  it("BLOQUEIA envio de mídia de template pessoal de OUTRO usuário (owner_user_id = OTHER_USER)", async () => {
    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: {
        id: "media-3",
        template_id: "tpl-other",
        storage_path: templateStoragePath,
        organization_id: ORG,
        message_templates: {
          id: "tpl-other",
          organization_id: ORG,
          owner_user_id: OTHER_USER,
        },
      },
    });

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: templateStoragePath,
      media_mime: "image/jpeg",
    };

    await expect(sendMessageHandler(supabase, baseCtx, input)).rejects.toMatchObject({
      status: 422,
      code: "invalid_media_path",
    });
  });

  it("BLOQUEIA envio quando a mídia de template não existe no banco", async () => {
    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: null,
    });

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: templateStoragePath,
      media_mime: "image/jpeg",
    };

    await expect(sendMessageHandler(supabase, baseCtx, input)).rejects.toMatchObject({
      status: 422,
      code: "invalid_media_path",
    });
  });

  it("BLOQUEIA envio quando o path pertence a outra organização", async () => {
    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: null,
    });

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: `outra-org/message-template-media/img-123.jpg`,
      media_mime: "image/jpeg",
    };

    await expect(sendMessageHandler(supabase, baseCtx, input)).rejects.toMatchObject({
      status: 422,
      code: "invalid_media_path",
    });
  });

  it("permite envio por ator não-humano (ex: webhook/ai) para templates da organização", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: { _serialized: "W3" } })));

    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: {
        id: "media-4",
        template_id: "tpl-shared",
        storage_path: templateStoragePath,
        organization_id: ORG,
        message_templates: {
          id: "tpl-shared",
          organization_id: ORG,
          owner_user_id: null,
        },
      },
    });

    const aiCtx: HandlerCtx = {
      organization_id: ORG,
      actor: { type: "webhook_source", id: "auto-1" },
      requestId: "req-auto-1",
    };

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: templateStoragePath,
      media_mime: "image/jpeg",
      body: "Envio automático",
    };

    const result = await sendMessageHandler(supabase, aiCtx, input);
    expect(result.status).toBe("sent");
  });

  it("BLOQUEIA envio por ator não-humano quando o template é privado (owner_user_id != null)", async () => {
    const { supabase } = criarDubleDoHandler({
      conversation: conversationRow(),
      templateMediaRow: {
        id: "media-5",
        template_id: "tpl-private",
        storage_path: templateStoragePath,
        organization_id: ORG,
        message_templates: {
          id: "tpl-private",
          organization_id: ORG,
          owner_user_id: USER,
        },
      },
    });

    const aiCtx: HandlerCtx = {
      organization_id: ORG,
      actor: { type: "ai_agent", id: "agent-1", role: "ai" },
      requestId: "req-agent-1",
    };

    const input: SendMessageInput = {
      conversation_id: CONV,
      type: "image",
      media_storage_path: templateStoragePath,
      media_mime: "image/jpeg",
    };

    await expect(sendMessageHandler(supabase, aiCtx, input)).rejects.toMatchObject({
      status: 422,
      code: "invalid_media_path",
    });
  });
});
