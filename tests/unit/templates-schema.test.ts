import { describe, expect, it } from "vitest";

import { createTemplateSchema, updateTemplateSchema } from "@/lib/schemas/templates";

describe("createTemplateSchema", () => {
  it("aceita template válido pessoal", () => {
    const r = createTemplateSchema.safeParse({ title: "Saudação", body: "Oi {{primeiro_nome}}!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shared).toBe(false);
  });

  it("aceita shared + shortcut", () => {
    const r = createTemplateSchema.safeParse({ title: "Fechamento", body: "Fechado!", shortcut: "fech", shared: true });
    expect(r.success).toBe(true);
  });

  it("aceita anexo de mídia (imagens e vídeos)", () => {
    const r = createTemplateSchema.safeParse({
      title: "Reserva confirmada",
      body: "Segue o mapa de acesso e regras:",
      shortcut: "reserva",
      media: [
        {
          storage_path: "11111111-1111-4111-8111-111111111111/message-template-media/22222222-2222-4222-8222-222222222222.png",
          media_mime: "image/png",
          media_size_bytes: 102400,
          filename: "mapa.png",
          position: 0,
        },
        {
          storage_path: "11111111-1111-4111-8111-111111111111/message-template-media/33333333-3333-4333-8333-333333333333.mp4",
          media_mime: "video/mp4",
          media_size_bytes: 5242880,
          filename: "video.mp4",
          position: 1,
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.media).toHaveLength(2);
      expect(r.data.media?.[0]?.media_mime).toBe("image/png");
    }
  });

  it("rejeita anexo que não seja imagem ou vídeo", () => {
    const r = createTemplateSchema.safeParse({
      title: "Doc",
      body: "Segue pdf",
      media: [
        {
          storage_path: "11111111-1111-4111-8111-111111111111/message-template-media/22222222-2222-4222-8222-222222222222.pdf",
          media_mime: "application/pdf",
          media_size_bytes: 1024,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejeita storage_path com formato ou namespace inválido", () => {
    const r = createTemplateSchema.safeParse({
      title: "Path inválido",
      body: "Foto de conversa de outro cliente",
      media: [
        {
          storage_path: "11111111-1111-4111-8111-111111111111/conversa-123/foto.png",
          media_mime: "image/png",
          media_size_bytes: 1024,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rejeita mais de 10 mídias por template", () => {
    const mediaList = Array.from({ length: 11 }, (_, i) => ({
      storage_path: `11111111-1111-4111-8111-111111111111/message-template-media/00000000-0000-4000-8000-00000000000${i.toString(16)}.png`,
      media_mime: "image/png",
      media_size_bytes: 1024,
    }));
    const r = createTemplateSchema.safeParse({
      title: "Muitas mídias",
      body: "11 imagens",
      media: mediaList,
    });
    expect(r.success).toBe(false);
  });

  it("rejeita title vazio e body vazio", () => {
    expect(createTemplateSchema.safeParse({ title: "", body: "x" }).success).toBe(false);
    expect(createTemplateSchema.safeParse({ title: "x", body: "" }).success).toBe(false);
  });

  it("rejeita body gigante (>4096)", () => {
    expect(createTemplateSchema.safeParse({ title: "x", body: "a".repeat(5000) }).success).toBe(false);
  });
});

describe("updateTemplateSchema", () => {
  it("aceita atualização parcial com mídias", () => {
    const r = updateTemplateSchema.safeParse({
      media: [
        {
          storage_path: "11111111-1111-4111-8111-111111111111/message-template-media/44444444-4444-4444-8444-444444444444.png",
          media_mime: "image/png",
          media_size_bytes: 204800,
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.media).toHaveLength(1);
    }
  });

  it("rejeita objeto vazio", () => {
    expect(updateTemplateSchema.safeParse({}).success).toBe(false);
  });
});
