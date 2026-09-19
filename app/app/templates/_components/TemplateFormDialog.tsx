"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Image as ImageIcon, Video as VideoIcon, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { MessageTemplate, TemplateMedia } from "@/hooks/inbox/useMessageTemplates";
import { useUploadTemplateMedia } from "@/hooks/inbox/useUploadTemplateMedia";
import { formatBytes } from "@/components/inbox/media/media-utils";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  template?: MessageTemplate | null;
}

interface CreateInput {
  title: string;
  body: string;
  shortcut?: string;
  shared?: boolean;
  media?: TemplateMedia[];
}

interface UpdateInput {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  media?: TemplateMedia[];
}

export function TemplateFormDialog({ open, onOpenChange, canShare, template }: Props) {
  const t = useT();
  const isEdit = !!template;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [mediaList, setMediaList] = React.useState<TemplateMedia[]>([]);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadMedia = useUploadTemplateMedia();

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: CreateInput) =>
      apiClient.post<{ data: MessageTemplate }>("/api/v1/message-templates", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpdateInput) =>
      apiClient.patch<{ data: MessageTemplate }>(`/api/v1/message-templates/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const pending = create.isPending || update.isPending || uploadMedia.isPending;

  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setBody(template?.body ?? "");
    setShortcut(template?.shortcut ?? "");
    setShared(template ? template.owner_user_id === null : false);
    setMediaList(template?.media ? [...template.media] : []);
  }, [open, template]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      try {
        const uploaded = await uploadMedia.mutateAsync(file);
        setMediaList((prev) => [
          ...prev,
          {
            storage_path: uploaded.storage_path,
            media_mime: uploaded.media_mime,
            media_size_bytes: uploaded.media_size_bytes,
            filename: uploaded.filename || file.name,
            position: prev.length,
            url: uploaded.url,
          },
        ]);
      } catch {
        // Erro já reportado pelo toast do uploadMedia
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveMedia = (index: number) => {
    setMediaList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: template.id,
          title,
          body,
          shortcut: shortcut.trim() || null,
          media: mediaList,
        });
        toast.success(t("Template atualizado."));
      } else {
        await create.mutateAsync({
          title,
          body,
          shortcut: shortcut.trim() || undefined,
          shared: canShare ? shared : false,
          media: mediaList,
        });
        toast.success(t("Template criado."));
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Editar template") : t("Novo template")}</DialogTitle>
          <DialogDescription>
            {t("Scripts salvos e mensagens automáticas com imagens ou vídeos para agilizar o atendimento.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-title">{t("Título")}</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Ex: Agendamento confirmado")}
              minLength={1}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">{t("Mensagem / Legenda")}</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("Oi {{primeiro_nome}}, sua reserva está confirmada! Endereço: Av. Principal, 100. Senha wifi: coworking123. Senha da porta: 4560.")}
              minLength={1}
              maxLength={4096}
              required
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              {t("Use")} {"{{primeiro_nome}}"} {t("e")} {"{{nome}}"} {t("para personalizar.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-shortcut">{t("Atalho (opcional)")}</Label>
            <Input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="reserva"
              maxLength={40}
            />
          </div>

          {/* Seção de Anexos de Mídia (Imagens e Vídeos) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t("Mídias anexadas (imagens e vídeos)")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={uploadMedia.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadMedia.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                {t("Adicionar mídia")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {mediaList.length > 0 ? (
              <div className="space-y-2">
                {mediaList.map((m, idx) => {
                  const isImage = m.media_mime.startsWith("image/");
                  const isVideo = m.media_mime.startsWith("video/");
                  return (
                    <div
                      key={m.storage_path || idx}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {isImage ? (
                          m.url ? (
                            <img
                              src={m.url}
                              alt={m.filename || "Imagem"}
                              className="size-10 rounded object-cover border border-border"
                            />
                          ) : (
                            <ImageIcon className="size-5 text-primary shrink-0" />
                          )
                        ) : isVideo ? (
                          <VideoIcon className="size-5 text-primary shrink-0" />
                        ) : (
                          <FileText className="size-5 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{m.filename || t("Arquivo de mídia")}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatBytes(m.media_size_bytes)} · {m.media_mime}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveMedia(idx)}
                        aria-label={t("Remover anexo")}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                {t("Nenhuma mídia anexada. Opcional: anexe mapas, fotos de acesso ou vídeos de apresentação.")}
              </p>
            )}
          </div>

          {canShare && (
            <div className="flex items-center gap-2 pt-2">
              <Switch
                id="tpl-shared"
                checked={shared}
                onCheckedChange={setShared}
                disabled={isEdit}
              />
              <Label htmlFor="tpl-shared">{t("Compartilhar com a equipe")}</Label>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("Salvando...")}
                </>
              ) : isEdit ? (
                t("Salvar")
              ) : (
                t("Criar template")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
