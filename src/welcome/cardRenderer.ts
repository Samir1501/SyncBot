import fs from "node:fs/promises";
import path from "node:path";
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { UPLOADS_DIR, type CardSettings, type TextLayer } from "../settings.js";

/**
 * @napi-rs/canvas yerel (native) Skia modülünü içerdiği için açılışta yüklendiğinde
 * kayda değer RAM tüketir. Modül yalnızca ilk kart çiziminde (tembel / lazy) yüklenir.
 */
type CanvasModule = typeof import("@napi-rs/canvas");
let canvasModulePromise: Promise<CanvasModule> | null = null;

function getCanvasModule(): Promise<CanvasModule> {
  if (!canvasModulePromise) {
    canvasModulePromise = import("@napi-rs/canvas").catch((error) => {
      canvasModulePromise = null;
      throw error;
    });
  }
  return canvasModulePromise;
}

/** Panel ve bot aynı yazı tipini kullansın diye ortak tanım */
export const FONT_FAMILY = "Segoe UI, Arial, sans-serif";

export interface CardData {
  username: string;
  displayName: string;
  avatarUrl: string;
  serverName: string;
  memberCount: number;
}

export function applyPlaceholders(text: string, data: CardData): string {
  return text
    .replaceAll("{username}", data.username)
    .replaceAll("{displayName}", data.displayName)
    .replaceAll("{server}", data.serverName)
    .replaceAll("{memberCount}", String(data.memberCount));
}

/** Panelden yüklenen (/uploads/...) veya harici (https://...) görselleri yükler */
async function loadImageSource(src: string): Promise<Image | null> {
  if (!src) return null;
  try {
    const { loadImage } = await getCanvasModule();
    if (src.startsWith("/uploads/")) {
      // path.basename ile klasör dışına çıkma (path traversal) engellenir
      const filePath = path.join(UPLOADS_DIR, path.basename(src));
      return await loadImage(await fs.readFile(filePath));
    }
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await loadImage(Buffer.from(await res.arrayBuffer()));
    }
  } catch (error) {
    console.warn(`[Kart] Görsel yüklenemedi (${src}):`, error);
  }
  return null;
}

/** Görseli tuvali tamamen kaplayacak şekilde (CSS "cover" gibi) çizer */
function drawCover(ctx: SKRSContext2D, img: Image, width: number, height: number): void {
  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

function drawText(ctx: SKRSContext2D, layer: TextLayer, data: CardData): void {
  ctx.save();
  const style = layer.fontStyle === "italic" ? "italic" : "normal";
  const weight = layer.fontWeight || "normal";
  const family = layer.fontFamily ? `${layer.fontFamily}, Arial, sans-serif` : FONT_FAMILY;
  ctx.font = `${style} ${weight} ${layer.fontSize}px ${family}`;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.align;
  ctx.textBaseline = "middle";

  let textStr = applyPlaceholders(layer.text, data);
  if (layer.uppercase) textStr = textStr.toUpperCase();

  if (layer.shadow) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }

  if (layer.stroke && (layer.strokeWidth || 0) > 0) {
    ctx.save();
    ctx.strokeStyle = layer.strokeColor || "#000000";
    ctx.lineWidth = layer.strokeWidth || 2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(textStr, layer.x, layer.y);
    ctx.restore();
  }

  ctx.fillText(textStr, layer.x, layer.y);

  if (layer.underline) {
    const textWidth = ctx.measureText(textStr).width;
    let lineX = layer.x;
    if (layer.align === "center") lineX = layer.x - textWidth / 2;
    else if (layer.align === "right") lineX = layer.x - textWidth;
    const lineY = layer.y + layer.fontSize * 0.55;
    ctx.save();
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = Math.max(1, Math.round(layer.fontSize / 16));
    ctx.beginPath();
    ctx.moveTo(lineX, lineY);
    ctx.lineTo(lineX + textWidth, lineY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export async function renderWelcomeCard(card: CardSettings, data: CardData): Promise<Buffer> {
  const { width, height, background, avatar } = card;
  const { createCanvas } = await getCanvasModule();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. Arka plan
  ctx.fillStyle = background.color;
  ctx.fillRect(0, 0, width, height);

  const bgImage = await loadImageSource(background.imageUrl);
  if (bgImage) drawCover(ctx, bgImage, width, height);

  if (background.overlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = background.overlayOpacity;
    ctx.fillStyle = background.overlayColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 2. Avatar
  if (avatar.enabled) {
    const avatarImage = await loadImageSource(data.avatarUrl);
    const r = avatar.size / 2;
    const left = avatar.x - r;
    const top = avatar.y - r;

    ctx.save();
    ctx.beginPath();
    if (avatar.shape === "circle") ctx.arc(avatar.x, avatar.y, r, 0, Math.PI * 2);
    else ctx.rect(left, top, avatar.size, avatar.size);
    ctx.closePath();
    ctx.clip();
    if (avatarImage) {
      ctx.drawImage(avatarImage, left, top, avatar.size, avatar.size);
    } else {
      ctx.fillStyle = "#5865f2";
      ctx.fill();
    }
    ctx.restore();

    if (avatar.borderWidth > 0) {
      ctx.save();
      ctx.beginPath();
      if (avatar.shape === "circle") ctx.arc(avatar.x, avatar.y, r, 0, Math.PI * 2);
      else ctx.rect(left, top, avatar.size, avatar.size);
      ctx.lineWidth = avatar.borderWidth;
      ctx.strokeStyle = avatar.borderColor;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Metin katmanları
  for (const layer of card.texts) {
    drawText(ctx, layer, data);
  }

  return canvas.encode("png");
}
