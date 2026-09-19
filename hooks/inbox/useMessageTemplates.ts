"use client";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface TemplateMedia {
  id?: string;
  storage_path: string;
  media_mime: string;
  media_size_bytes: number;
  filename?: string | null;
  position?: number;
  url?: string | null;
}

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  owner_user_id: string | null;
  media?: TemplateMedia[];
}

/** Templates de script (pessoais + compartilhados) para o slash-menu do composer e mensagens salvas. */
export function useMessageTemplates() {
  const podeConsultar = usePermission("message-templates.view");
  return useQuery({
    enabled: podeConsultar,
    queryKey: ["message-templates"],
    queryFn: async () => apiClient.get<{ data: MessageTemplate[] }>("/api/v1/message-templates"),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}
