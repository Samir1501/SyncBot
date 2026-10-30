import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegPkg from "ffmpeg-static";

const ffmpegBinary: string | null =
  typeof ffmpegPkg === "string"
    ? ffmpegPkg
    : (ffmpegPkg as unknown as { default?: string })?.default || null;

/**
 * Verilen bir video URL'sinden veya yerel dosya yolundan ilk kareyi (frame/thumbnail)
 * bellek üzerinde JPEG Buffer olarak yakalar.
 * 
 * @param videoUrl - Discord CDN veya doğrudan video akış URL'si (.mp4, .webm, .mov vb.)
 * @param timeoutMs - İşlemin azami süresi (varsayılan 6000ms)
 * @returns JPEG formatında Buffer veya başarısız olursa null
 */
export async function extractVideoThumbnail(
  videoUrl: string,
  timeoutMs = 6000
): Promise<Buffer | null> {
  if (!ffmpegBinary || !videoUrl) return null;

  const runFfmpeg = (args: string[]): Promise<Buffer | null> => {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let isResolved = false;

      const finish = (result: Buffer | null) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          resolve(result);
        }
      };

      const proc: ChildProcessWithoutNullStreams = spawn(ffmpegBinary, args, {
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        finish(null);
      }, timeoutMs);

      proc.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      proc.on("error", (err: Error) => {
        console.warn("[VideoThumbnail] FFmpeg çalıştırma hatası:", err.message);
        finish(null);
      });

      proc.on("close", (code: number | null) => {
        if (code === 0 && chunks.length > 0) {
          finish(Buffer.concat(chunks));
        } else {
          finish(null);
        }
      });
    });
  };

  try {
    // 1. Önce 0.5. saniyedeki kareyi yakalamayı dene (çoğu videoda 0. saniye siyah ekran olabiliyor)
    const primaryArgs = [
      "-ss",
      "00:00:00.500",
      "-i",
      videoUrl,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-f",
      "image2",
      "-",
    ];

    let buffer = await runFfmpeg(primaryArgs);

    // 2. Eğer video çok kısaysa (0.5 sn'den kısa) doğrudan ilk kareyi (0. sn) dene
    if (!buffer || buffer.length === 0) {
      const fallbackArgs = [
        "-i",
        videoUrl,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-f",
        "image2",
        "-",
      ];
      buffer = await runFfmpeg(fallbackArgs);
    }

    return buffer && buffer.length > 0 ? buffer : null;
  } catch (error) {
    console.warn("[VideoThumbnail] Kapak karesi alınamadı:", error);
    return null;
  }
}
