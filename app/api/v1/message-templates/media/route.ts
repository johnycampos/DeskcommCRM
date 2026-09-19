import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/message-templates/media — upload de mídia para respostas rápidas (templates).
 *
 * Mídias de templates pertencem à organização/template (não a uma conversa específica).
 * O arquivo é guardado no bucket privado 'whatsapp-media' sob `{orgId}/templates/{uuid}.{ext}`.
 * Devolve os metadados e uma URL assinada temporária para preview no frontend.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** 1 hora de validade para preview do editor e seletor. */
const PREVIEW_TTL_SEGUNDOS = 60 * 60;

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;

  // Guard de DoS por Content-Length declarado
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", t("Arquivo acima de 50MB."), 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status = verdict.code === "payload_too_large" ? 413 : verdict.code === "unsupported_media_type" ? 415 : 422;
    return fail(verdict.code, verdict.message, status, { requestId });
  }

  // Templates aceitam imagens e vídeos (Top Coworking)
  if (verdict.kind !== "image" && verdict.kind !== "video" && verdict.kind !== "document") {
    return fail("unsupported_media_type", t("Mídia não suportada para template (apenas imagem ou vídeo)."), 415, { requestId });
  }

  const ext = extFromMime(mime);
  const storagePath = `${org.orgId}/templates/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();

  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(storagePath, buffer, { contentType: mime, upsert: false });

  if (upErr) {
    logger.error("[message-templates/media] upload falhou", { detail: upErr.message, requestId });
    return fail("internal_error", t("Erro ao subir a mídia do template."), 500, { requestId });
  }

  const { data: assinada } = await admin.storage
    .from("whatsapp-media")
    .createSignedUrl(storagePath, PREVIEW_TTL_SEGUNDOS);

  return ok(
    {
      storage_path: storagePath,
      media_mime: mime,
      media_size_bytes: buffer.length,
      kind: verdict.kind,
      filename: file.name || null,
      url: assinada?.signedUrl ?? null,
    },
    { requestId },
  );
}
