import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { SavedMessagesDialog } from "@/components/inbox/SavedMessagesDialog";

const mockMutateAsync = vi.fn();
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

const mockTemplates = [
  {
    id: "tpl-1",
    title: "Saudação simples",
    body: "Olá {{primeiro_nome}}, bem-vindo!",
    shortcut: "oi",
    owner_user_id: "user-1",
    media: [],
  },
  {
    id: "tpl-2",
    title: "Confirmação com mapa",
    body: "Olá {{nome}}, sua reserva está confirmada. Segue o mapa de acesso:",
    shortcut: "mapa",
    owner_user_id: null,
    media: [
      {
        id: "med-1",
        storage_path: "org_1/templates/mapa.png",
        media_mime: "image/png",
        media_size_bytes: 102400,
        filename: "mapa.png",
      },
    ],
  },
  {
    id: "tpl-3",
    title: "Acesso completo (foto + vídeo)",
    body: "Instruções de acesso para {{primeiro_nome}}:",
    shortcut: "acesso",
    owner_user_id: null,
    media: [
      {
        id: "med-2",
        storage_path: "org_1/templates/fachada.jpg",
        media_mime: "image/jpeg",
        media_size_bytes: 512000,
        filename: "fachada.jpg",
      },
      {
        id: "med-3",
        storage_path: "org_1/templates/como_entrar.mp4",
        media_mime: "video/mp4",
        media_size_bytes: 2048000,
        filename: "como_entrar.mp4",
      },
    ],
  },
];

vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({
    data: mockTemplates,
    isLoading: false,
  }),
}));

describe("SavedMessagesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza lista de templates com título, atalho e badges de mídia", () => {
    render(
      <SavedMessagesDialog
        open={true}
        onOpenChange={vi.fn()}
        conversationId="conv-123"
        contactName="Johny Freitas"
      />,
    );

    expect(screen.getByText("Mensagens salvas")).toBeDefined();
    expect(screen.getByText("Saudação simples")).toBeDefined();
    expect(screen.getByText("Confirmação com mapa")).toBeDefined();
    expect(screen.getByText("Acesso completo (foto + vídeo)")).toBeDefined();
    expect(screen.getByText("1 anexo")).toBeDefined();
    expect(screen.getByText("2 anexos")).toBeDefined();
  });

  it("filtra templates pela busca", () => {
    render(
      <SavedMessagesDialog
        open={true}
        onOpenChange={vi.fn()}
        conversationId="conv-123"
        contactName="Johny Freitas"
      />,
    );

    const input = screen.getByPlaceholderText("Buscar por título, atalho ou texto...");
    fireEvent.change(input, { target: { value: "mapa" } });

    expect(screen.queryByText("Saudação simples")).toBeNull();
    expect(screen.getByText("Confirmação com mapa")).toBeDefined();
  });

  it("envia template de texto interpolado diretamente", async () => {
    mockMutateAsync.mockResolvedValueOnce({});
    const onOpenChange = vi.fn();

    render(
      <SavedMessagesDialog
        open={true}
        onOpenChange={onOpenChange}
        conversationId="conv-123"
        contactName="Johny Freitas"
      />,
    );

    // Clica no primeiro botão Enviar (tpl-1)
    const sendButtons = screen.getAllByText("Enviar");
    fireEvent.click(sendButtons[0]!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        conversation_id: "conv-123",
        type: "text",
        body: "Olá Johny, bem-vindo!",
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("envia template com 1 mídia como mensagem de imagem com legenda", async () => {
    mockMutateAsync.mockResolvedValueOnce({});
    const onOpenChange = vi.fn();

    render(
      <SavedMessagesDialog
        open={true}
        onOpenChange={onOpenChange}
        conversationId="conv-123"
        contactName="Johny Freitas"
      />,
    );

    // Clica no segundo botão Enviar (tpl-2)
    const sendButtons = screen.getAllByText("Enviar");
    fireEvent.click(sendButtons[1]!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        conversation_id: "conv-123",
        type: "image",
        body: "Olá Johny Freitas, sua reserva está confirmada. Segue o mapa de acesso:",
        media_storage_path: "org_1/templates/mapa.png",
        media_mime: "image/png",
        media_size_bytes: 102400,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("envia template com múltiplas mídias em sequência (1ª com legenda, 2ª sem)", async () => {
    mockMutateAsync.mockResolvedValue({});
    const onOpenChange = vi.fn();

    render(
      <SavedMessagesDialog
        open={true}
        onOpenChange={onOpenChange}
        conversationId="conv-123"
        contactName="Johny Freitas"
      />,
    );

    // Clica no terceiro botão Enviar (tpl-3)
    const sendButtons = screen.getAllByText("Enviar");
    fireEvent.click(sendButtons[2]!);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      expect(mockMutateAsync).toHaveBeenNthCalledWith(1, {
        conversation_id: "conv-123",
        type: "image",
        body: "Instruções de acesso para Johny:",
        media_storage_path: "org_1/templates/fachada.jpg",
        media_mime: "image/jpeg",
        media_size_bytes: 512000,
      });
      expect(mockMutateAsync).toHaveBeenNthCalledWith(2, {
        conversation_id: "conv-123",
        type: "video",
        body: undefined,
        media_storage_path: "org_1/templates/como_entrar.mp4",
        media_mime: "video/mp4",
        media_size_bytes: 2048000,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("desabilita envio se a conversa estiver bloqueada/janela fechada", () => {
    render(
      <SavedMessagesDialog
        open={true}
        onOpenChange={vi.fn()}
        conversationId="conv-123"
        contactName="Johny Freitas"
        disabled={true}
        blockedReason="Janela de 24h fechada"
      />,
    );

    const sendButtons = screen.getAllByRole("button", { name: /enviar/i });
    for (const btn of sendButtons) {
      expect(btn.hasAttribute("disabled")).toBe(true);
    }
  });
});
