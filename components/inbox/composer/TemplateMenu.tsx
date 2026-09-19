"use client";
import { useT } from "@/hooks/i18n/useT";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { Image as ImageIcon } from "lucide-react";

/** Estado do slash-menu a partir do texto do composer. Puro (testável). */
export function resolveSlash(text: string): { open: boolean; query: string } {
  if (!text.startsWith("/")) return { open: false, query: "" };
  const rest = text.slice(1);
  if (/\s/.test(rest)) return { open: false, query: "" };
  return { open: true, query: rest };
}

interface Props {
  open: boolean;
  query: string;
  templates: MessageTemplate[];
  onPick: (t: MessageTemplate) => void;
  onClose: () => void;
}

export function TemplateMenu({ open, query, templates, onPick, onClose: _onClose }: Props) {
  const t = useT();
  if (!open) return null;
  const q = query.toLowerCase();
  const filtered = templates.filter(
    (tpl) => tpl.title.toLowerCase().includes(q) || (tpl.shortcut ?? "").toLowerCase().includes(q),
  );
  return (
    <div
      className="absolute bottom-14 left-3 z-20 max-h-64 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label={t("Templates de script")}
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">{t("Nenhum template. Crie em Configurações.")}</div>
      ) : (
        filtered.map((tpl) => {
          const mediaCount = tpl.media?.length ?? 0;
          return (
            <button
              key={tpl.id}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted"
              onClick={() => onPick(tpl)}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{tpl.title}</span>
                {mediaCount > 0 && (
                  <span className="flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <ImageIcon className="size-2.5" />
                    {mediaCount}
                  </span>
                )}
              </div>
              <span className="line-clamp-1 text-xs text-muted-foreground">{tpl.body}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
