import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH  /api/v1/message-templates/[id] — atualiza título/corpo/atalho e mídias.
 * DELETE /api/v1/message-templates/[id] — remove o template (e mídias em cascade/Storage).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateTemplateSchema } from "@/lib/schemas/templates";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { media, ...templateFields } = parsed.data;
  const supabase = await createClient();

  // Atualiza campos do template se houver algum
  let templateData: Record<string, unknown> | null = null;
  if (Object.keys(templateFields).length > 0) {
    const { data, error } = await supabase
      .from("message_templates")
      .update({ ...templateFields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", org.orgId)
      .select("id, organization_id, owner_user_id, title, body, shortcut, created_by_user_id, created_at, updated_at")
      .single();
    if (error || !data) return fail("not_found", t("Template não encontrado."), 404, { requestId });
    templateData = data;
  } else {
    // Apenas seleciona para confirmar existência e permissão
    const { data, error } = await supabase
      .from("message_templates")
      .select("id, organization_id, owner_user_id, title, body, shortcut, created_by_user_id, created_at, updated_at")
      .eq("id", id)
      .eq("organization_id", org.orgId)
      .single();
    if (error || !data) return fail("not_found", t("Template não encontrado."), 404, { requestId });
    templateData = data;
  }

  let finalMedia: Array<{ id: string; storage_path: string; media_mime: string; media_size_bytes: number; filename: string | null; position: number }> = [];

  if (media !== undefined) {
    // 1. Busca mídias antigas para registrar IDs e paths antes de alterar
    const { data: oldMedia } = await supabase
      .from("message_template_media")
      .select("id, storage_path")
      .eq("template_id", id)
      .eq("organization_id", org.orgId);

    const oldMediaIds = (oldMedia ?? []).map((m) => m.id);
    const oldPaths = (oldMedia ?? []).map((m) => m.storage_path);

    // 2. Insere mídias novas PRIMEIRO — se falhar, preserva mídias antigas sem perda de dados
    if (media.length > 0) {
      const mediaRows = media.map((m, idx) => ({
        template_id: id,
        organization_id: org.orgId,
        storage_path: m.storage_path,
        media_mime: m.media_mime,
        media_size_bytes: m.media_size_bytes,
        filename: m.filename ?? null,
        position: m.position ?? idx,
      }));
      const { data: mediaInserted, error: insertErr } = await supabase
        .from("message_template_media")
        .insert(mediaRows)
        .select("id, storage_path, media_mime, media_size_bytes, filename, position");
      if (insertErr || !mediaInserted) {
        return fail("internal_error", t("Erro ao salvar mídias do template."), 500, { requestId });
      }
      finalMedia = mediaInserted;
    }

    // 3. Com a inserção confirmada, deleta mídias antigas do banco
    let dbDeleteSuccess = true;
    if (oldMediaIds.length > 0) {
      const { error: delErr } = await supabase
        .from("message_template_media")
        .delete()
        .in("id", oldMediaIds)
        .eq("organization_id", org.orgId);
      if (delErr) {
        dbDeleteSuccess = false;
        logger.warn("[message-templates/patch] Falha ao excluir referências antigas de mídia no banco", {
          templateId: id,
          error: delErr.message,
          requestId,
        });
      }
    }

    // 4. Limpa do Storage apenas se a exclusão no banco foi confirmada com sucesso
    if (dbDeleteSuccess) {
      const newPaths = new Set(media.map((m) => m.storage_path));
      const pathsToDelete = oldPaths.filter((path) => !newPaths.has(path));

      if (pathsToDelete.length > 0) {
        const admin = createAdminClient();
        const { error: remErr } = await admin.storage.from("whatsapp-media").remove(pathsToDelete);
        if (remErr) {
          logger.warn("[message-templates/patch] Falha ao remover arquivos órfãos do Storage", {
            paths: pathsToDelete,
            error: remErr.message,
            requestId,
          });
        }
      }
    }
  } else {
    // Mantém as existentes
    const { data: existingMedia } = await supabase
      .from("message_template_media")
      .select("id, storage_path, media_mime, media_size_bytes, filename, position")
      .eq("template_id", id)
      .eq("organization_id", org.orgId)
      .order("position", { ascending: true });
    if (existingMedia) finalMedia = existingMedia;
  }

  void audit({
    action: "template.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message_template",
    resourceId: id,
    requestId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return ok({ ...templateData, media: finalMedia }, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const supabase = await createClient();

  // Busca mídias associadas para remover do Storage após confirmação
  const { data: existingMedia } = await supabase
    .from("message_template_media")
    .select("storage_path")
    .eq("template_id", id)
    .eq("organization_id", org.orgId);

  const { data: deleted, error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao excluir template.", 500, { requestId });
  if (!deleted) return fail("not_found", t("Template não encontrado."), 404, { requestId });

  if (existingMedia && existingMedia.length > 0) {
    const paths = existingMedia.map((m) => m.storage_path);
    const admin = createAdminClient();
    const { error: remErr } = await admin.storage.from("whatsapp-media").remove(paths);
    if (remErr) {
      logger.warn("[message-templates/delete] Falha ao remover arquivos do Storage após exclusão de template", {
        paths,
        error: remErr.message,
        requestId,
      });
    }
  }

  void audit({
    action: "template.deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message_template",
    resourceId: deleted.id,
    requestId,
  });
  return noContent(requestId);
}
