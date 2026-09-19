"use client";

import * as React from "react";
import { useT } from "@/hooks/i18n/useT";
import { toast } from "sonner";
import { Search, Image as ImageIcon, Video as VideoIcon, FileText, Send, Bookmark, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { useSendMessage } from "@/hooks/inbox/useSendMessage";
import { interpolateTemplate } from "@/lib/inbox/template-vars";
import { formatBytes } from "@/components/inbox/media/media-utils";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactName?: string | null;
  disabled?: boolean;
  blockedReason?: string | null;
}

export function SavedMessagesDialog({
  open,
  onOpenChange,
  conversationId,
  contactName,
  disabled = false,
  blockedReason = null,
}: Props) {
  const t = useT();
  const [search, setSearch] = React.useState("");
  const [sendingId, setSendingId] = React.useState<string | null>(null);

  const { data: templates, isLoading } = useMessageTemplates();
  const send = useSendMessage();

  const filtered = React.useMemo(() => {
    if (!templates) return [];
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (tpl) =>
        tpl.title.toLowerCase().includes(q) ||
        (tpl.shortcut && tpl.shortcut.toLowerCase().includes(q)) ||
        tpl.body.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const handleSendDirect = async (template: MessageTemplate) => {
    if (disabled || blockedReason) {
      toast.error(blockedReason || t("Envio de mensagens bloqueado nesta conversa."));
      return;
    }

    try {
      setSendingId(template.id);
      const interpolatedBody = interpolateTemplate(template.body, { name: contactName ?? null });
      const mediaList = template.media ?? [];

      if (mediaList.length === 0) {
        // Envio simples de texto
        await send.mutateAsync({
          conversation_id: conversationId,
          type: "text",
          body: interpolatedBody,
        });
      } else if (mediaList.length === 1 && mediaList[0]) {
        // 1 mídia: envia como mensagem de mídia com texto de legenda
        const m = mediaList[0];
        const kind = m.media_mime.startsWith("video/")
          ? "video"
          : m.media_mime.startsWith("image/")
            ? "image"
            : "document";

        await send.mutateAsync({
          conversation_id: conversationId,
          type: kind,
          body: interpolatedBody || undefined,
          media_storage_path: m.storage_path,
          media_mime: m.media_mime,
          media_size_bytes: m.media_size_bytes,
        });
      } else {
        // Múltiplas mídias: 1ª mídia com legenda e as subsequentes em sequência
        for (let i = 0; i < mediaList.length; i++) {
          const m = mediaList[i];
          if (!m) continue;
          const kind = m.media_mime.startsWith("video/")
            ? "video"
            : m.media_mime.startsWith("image/")
              ? "image"
              : "document";

          await send.mutateAsync({
            conversation_id: conversationId,
            type: kind,
            body: i === 0 ? (interpolatedBody || undefined) : undefined,
            media_storage_path: m.storage_path,
            media_mime: m.media_mime,
            media_size_bytes: m.media_size_bytes,
          });
        }
      }

      toast.success(t("Mensagem salva enviada ao cliente."));
      onOpenChange(false);
    } catch {
      // Erro reportado pelo toast do send
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden flex flex-col sm:max-w-xl p-0">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Bookmark className="size-5 text-primary" />
            <DialogTitle>{t("Mensagens salvas")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("Selecione uma resposta rápida ou script para enviar diretamente ao cliente.")}
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Buscar por título, atalho ou texto...")}
              className="pl-8"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>{t("Carregando mensagens salvas...")}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? t("Nenhuma mensagem salva encontrada para esta busca.")
                : t("Nenhuma mensagem salva cadastrada.")}
            </div>
          ) : (
            filtered.map((tpl) => {
              const isSending = sendingId === tpl.id;
              const mediaCount = tpl.media?.length ?? 0;
              const previewText = interpolateTemplate(tpl.body, { name: contactName ?? null });

              return (
                <div
                  key={tpl.id}
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary hover:bg-muted/30",
                    isSending && "opacity-70 pointer-events-none",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{tpl.title}</span>
                      <Badge variant={tpl.owner_user_id ? "outline" : "default"} className="text-[10px] h-4">
                        {t(tpl.owner_user_id ? "Pessoal" : "Compartilhado")}
                      </Badge>
                      {tpl.shortcut && (
                        <Badge variant="secondary" className="font-mono text-[10px] h-4">
                          /{tpl.shortcut}
                        </Badge>
                      )}
                      {mediaCount > 0 && (
                        <Badge variant="secondary" className="flex items-center gap-1 text-[10px] h-4">
                          <ImageIcon className="size-3" />
                          {mediaCount === 1 ? t("1 anexo") : `${mediaCount} ${t("anexos")}`}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 gap-1.5 text-xs shrink-0"
                      disabled={disabled || !!blockedReason || isSending || send.isPending}
                      onClick={() => handleSendDirect(tpl)}
                    >
                      {isSending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      {isSending ? t("Enviando...") : t("Enviar")}
                    </Button>
                  </div>

                  <p className="line-clamp-3 text-xs text-muted-foreground whitespace-pre-wrap">
                    {previewText}
                  </p>

                  {/* Prévia dos Anexos se houver */}
                  {mediaCount > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
                      {tpl.media?.map((m, idx) => {
                        const isImg = m.media_mime.startsWith("image/");
                        const isVid = m.media_mime.startsWith("video/");
                        return (
                          <div
                            key={m.storage_path || idx}
                            className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {isImg ? (
                              <ImageIcon className="size-3 text-primary" />
                            ) : isVid ? (
                              <VideoIcon className="size-3 text-primary" />
                            ) : (
                              <FileText className="size-3" />
                            )}
                            <span className="max-w-[140px] truncate">{m.filename || t("Mídia")}</span>
                            <span>({formatBytes(m.media_size_bytes)})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
