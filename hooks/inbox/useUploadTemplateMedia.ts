"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import type { TemplateMedia } from "@/hooks/inbox/useMessageTemplates";

interface UploadTemplateMediaResult extends TemplateMedia {
  kind: "image" | "video" | "document";
}

export function useUploadTemplateMedia() {
  const t = useT();

  return useMutation({
    mutationFn: async (file: File): Promise<UploadTemplateMediaResult> => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/v1/message-templates/media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = err?.error?.message || t("Erro ao subir a mídia.");
        throw new Error(msg);
      }

      const json = await res.json();
      return json.data;
    },
    onError: (err: Error) => {
      toast.error(err.message || t("Erro no upload de mídia."));
    },
  });
}
