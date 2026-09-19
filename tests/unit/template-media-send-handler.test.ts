import { describe, expect, it } from "vitest";

import { isMediaPathOwnedBy } from "@/lib/messaging/media/upload-validation";

describe("isMediaPathOwnedBy - suporte a templates e conversas", () => {
  const orgId = "org-123";
  const convId = "conv-456";

  it("permite mídia de conversa da mesma org e conversa", () => {
    expect(isMediaPathOwnedBy(`${orgId}/${convId}/foto.jpg`, orgId, convId)).toBe(true);
  });

  it("permite mídia de template da mesma org em qualquer conversa da org", () => {
    expect(isMediaPathOwnedBy(`${orgId}/templates/uuid-1.png`, orgId, convId)).toBe(true);
    expect(isMediaPathOwnedBy(`${orgId}/templates/sub/video.mp4`, orgId, convId)).toBe(true);
  });

  it("bloqueia mídia de template de outra org", () => {
    expect(isMediaPathOwnedBy("outra-org/templates/uuid-1.png", orgId, convId)).toBe(false);
  });

  it("bloqueia mídia de conversa de outra org ou conversa", () => {
    expect(isMediaPathOwnedBy("outra-org/conv-456/foto.jpg", orgId, convId)).toBe(false);
    expect(isMediaPathOwnedBy(`${orgId}/outra-conv/foto.jpg`, orgId, convId)).toBe(false);
  });

  it("bloqueia prefixos com confusão de nome", () => {
    expect(isMediaPathOwnedBy(`${orgId}x/templates/uuid-1.png`, orgId, convId)).toBe(false);
    expect(isMediaPathOwnedBy(`${orgId}x/${convId}/foto.jpg`, orgId, convId)).toBe(false);
  });
});
