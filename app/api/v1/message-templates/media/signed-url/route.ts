/**
 * GET /api/v1/message-templates/media/signed-url?path=... — gera signed URL para preview de mídia de template.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PREVIEW_TTL_SEGUNDOS = 60 * 60;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;

  const storagePath = req.nextUrl.searchParams.get("path");
  if (!storagePath || !storagePath.startsWith(`${org.orgId}/`)) {
    return fail("forbidden", t("Caminho de mídia inválido ou de outra organização."), 403, { requestId });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("whatsapp-media")
    .createSignedUrl(storagePath, PREVIEW_TTL_SEGUNDOS);

  if (error || !data?.signedUrl) {
    return fail("not_found", t("Mídia não encontrada no armazenamento."), 404, { requestId });
  }

  return ok({ url: data.signedUrl }, { requestId });
}
