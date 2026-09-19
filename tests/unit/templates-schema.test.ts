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
          storage_path: "org_123/templates/mapa.png",
          media_mime: "image/png",
          media_size_bytes: 102400,
          filename: "mapa.png",
          position: 0,
        },
        {
          storage_path: "org_123/templates/video.mp4",
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
          storage_path: "org_123/templates/novo_mapa.png",
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
