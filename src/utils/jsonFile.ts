import fs from "node:fs";
import path from "node:path";

export interface DebouncedJsonWriter {
  /** Değişiklik olduğunu bildirir; yazma işlemi gecikmeli ve tek seferde yapılır */
  schedule(): void;
  /** Bekleyen değişiklikleri senkron olarak hemen diske yazar (kapanışta kullanılır) */
  flushSync(): void;
}

/**
 * Bellek dostu, debounce'lu ve atomik JSON dosya yazıcı.
 * - Sık değişen verilerde her değişiklikte diske yazmak yerine tek bir yazma planlar.
 * - Olay döngüsünü bloklamamak için asenkron yazar.
 * - Önce geçici dosyaya yazıp sonra yeniden adlandırır; yazma sırasında çökme olursa
 *   eski dosya bozulmaz.
 * - Girintisiz (compact) JSON üretir; bu sayede geçici string boyutu ve disk kullanımı azalır.
 */
export function createDebouncedJsonWriter(
  filePath: string,
  getData: () => unknown,
  delayMs: number,
  label: string
): DebouncedJsonWriter {
  const dir = path.dirname(filePath);
  const tmpPath = `${filePath}.tmp`;
  let timer: NodeJS.Timeout | null = null;
  let writing = false;
  let dirty = false;

  async function write(): Promise<void> {
    // Önceki yazma sürüyorsa; bittiğinde 'dirty' bayrağı sayesinde yeniden planlanır
    if (writing) return;
    writing = true;
    dirty = false;
    try {
      const json = JSON.stringify(getData());
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(tmpPath, json, "utf-8");
      try {
        await fs.promises.rename(tmpPath, filePath);
      } catch {
        // Bazı sistemlerde (ör. dosya kilitliyse) rename başarısız olabilir; doğrudan yaz
        await fs.promises.writeFile(filePath, json, "utf-8");
        await fs.promises.rm(tmpPath, { force: true });
      }
    } catch (err) {
      console.error(`[${label}] Veriler diske kaydedilemedi:`, err);
    } finally {
      writing = false;
      if (dirty) schedule();
    }
  }

  function schedule(): void {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void write();
    }, delayMs);
  }

  function flushSync(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // Asenkron yazma yarıda kalabileceği için o durumda da senkron yaz
    if (!dirty && !writing) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(getData()), "utf-8");
      dirty = false;
    } catch (err) {
      console.error(`[${label}] Kapanışta veriler diske yazılamadı:`, err);
    }
  }

  return { schedule, flushSync };
}
