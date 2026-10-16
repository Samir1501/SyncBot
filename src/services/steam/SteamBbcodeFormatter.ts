import type { FormattedSteamAnnouncement, SteamNewsItem } from "../steamService.js";

/**
 * Single Responsibility (SRP): Steam duyurusu içerisindeki BBCode biçimlendirmelerini
 * Discord Markdown formatına dönüştürür, ilk görseli ayıklar ve metni özetler.
 */
export class SteamBbcodeFormatter {
  public format(
    item: SteamNewsItem,
    gameName?: string,
    maxLength = 1800
  ): FormattedSteamAnnouncement {
    let content = item.contents || "";
    let extractedImage: string | undefined;

    // 1. Steam Clan İmajlarını normalize et (çift slash '//' oluşmasını önle)
    content = content.replace(
      /\{STEAM_CLAN_IMAGE\}\/?/g,
      "https://clan.fastly.steamstatic.com/images/"
    );
    content = content.replace(
      /\{STEAM_CLAN_LOC_IMAGE\}\/?/g,
      "https://clan.fastly.steamstatic.com/images/"
    );

    // 2. İlk görseli embed görseli olarak ayıkla ([img src="..."] veya [img]...[/img])
    const imgTagMatch =
      content.match(/\[img[^\]]*\bsrc=["']?([^"'\]\s]+)["']?[^\]]*\]/i) ||
      content.match(/\[img\]\s*(https?:\/\/[^\s\]]+)\s*\[\/img\]/i);

    if (imgTagMatch && imgTagMatch[1]) {
      extractedImage = imgTagMatch[1].trim();
    }

    // 3. İçerikteki tüm [img ...] ve [carousel] etiketlerini temizle
    content = content.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, "");
    content = content.replace(/\[img[^\]]*\/?\]/gi, "");
    content = content.replace(/\[\/?carousel[^\]]*\]/gi, "");

    // 4. Paragraflar ve Satır Sonu Etiketleri
    content = content.replace(/\[p\]\s*\[\/p\]/gi, "\n\n");
    content = content.replace(/\[p\]/gi, "");
    content = content.replace(/\[\/p\]/gi, "\n");
    content = content.replace(/\[br\]/gi, "\n");

    // 5. Liste Etiketleri
    content = content.replace(/\[list\]/gi, "\n");
    content = content.replace(/\[\/list\]/gi, "\n");
    content = content.replace(/\[\*\]/gi, "\n• ");
    content = content.replace(/\[\/\*\]/gi, "");

    // 6. Başlıklar (Discord Embed açıklamasında ### çalışmadığı için temiz bold başlık yapılır)
    content = content.replace(
      /\[h[1-3]\]\s*(?:\[b\])?([\s\S]*?)(?:\[\/b\])?\s*\[\/h[1-3]\]/gi,
      "\n\n**$1**\n\n"
    );

    content = content.replace(/^#{1,3}\s+(?:\*\*)?([^*\n]+)(?:\*\*)?/gm, "\n**$1**\n");
    content = content.replace(/([^\n])\s*(#{1,3}\s+)/g, "$1\n\n");

    // 7. BBCode biçimlendirmelerini Discord Markdown'a çevir
    content = content
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "**$1**")
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "*$1*")
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "__$1__")
      .replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, "~~$1~~")
      .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, "```\n$1\n```")
      .replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, "> $1\n")
      .replace(/\[url=(https?:\/\/[^\s\]]+)\]([\s\S]*?)\[\/url\]/gi, "[$2]($1)")
      .replace(/\[url\](https?:\/\/[^\s\]]+)\[\/url\]/gi, "$1");

    // Fazla/iç içe geçmiş yıldızları (** ** -> **) düzelt
    content = content.replace(/\*{4,}([^*]+)\*{4,}/g, "**$1**");

    // 8. Desteklenmeyen veya kalan HTML / BBCode kalıntılarını temizle
    content = content.replace(/\[\/?[a-zA-Z0-9_\-]+(?:\s+[^\]]*)?\]/gi, "");
    content = content.replace(/\[\/\]/g, "");
    content = content.replace(/<[^>]+>/g, "");

    // 9. Liste madde imlerinin (•) başında yeni satır olmasını sağla
    content = content.replace(/([^\n])\s*•\s*/g, "$1\n• ");

    // 10. Satırları temizle ve fazla boşlukları düzenle
    content = content
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // 11. Uzunluk sınırını güvenli uygula
    let summary = content;
    if (summary.length > maxLength) {
      const cutIndex = summary.lastIndexOf("\n", maxLength);
      const safeCut = cutIndex > maxLength * 0.7 ? cutIndex : maxLength;
      summary =
        summary.substring(0, safeCut).trim() +
        "\n\n*(Yama notlarının tamamı Steam duyurusunda...)*";
    }

    if (!summary) {
      summary =
        "Yeni bir güncelleme yayınlandı! Detayları Steam duyurusundan inceleyebilirsiniz.";
    }

    const fallbackHeader = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.appid}/header.jpg`;
    const finalImage = extractedImage || fallbackHeader;

    return {
      gid: item.gid,
      title: item.title || "Yeni Güncelleme",
      url: item.url,
      author: item.author || "Geliştirici",
      date: new Date(item.date * 1000),
      summary,
      imageUrl: finalImage,
      gameName,
    };
  }
}

export const steamBbcodeFormatter = new SteamBbcodeFormatter();
