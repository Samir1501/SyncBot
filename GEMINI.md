# Proje Kuralları & Yönergeleri

## Otomatik Mod & Proaktif Eylem (Auto Mode)
- **Tam Otonom Çalışma**: Kullanıcıya gereksiz onay veya soru sormadan istenen tüm işlemleri baştan sona doğrudan uygula ve tamamla.
- **Terminal Onaylarını Önleme**: Kullanıcıya terminal onay penceresi çıkartmamak ve kesintisiz çalışmak adına kabuk komutları yerine her zaman yerleşik IDE araçlarını (`view_file`, `replace_file_content`, `write_to_file`) kullan. Kod, test ve kontrol süreçlerinde kullanıcıdan müdahale bekleme.

## Dosya İşlemleri & İzinler
- **Doğrudan Dosya Araçları Kullanımı**: Kod ve dosya okuma, arama ve düzenleme işlemleri için kabuk komutları (`run_command` üzerinden `Get-Content`, `cat`, `grep`, `findstr`, `node` dosya betikleri vb.) **KULLANILMAMALIDIR**.
- Kullanıcıdan her seferinde terminal izni istememek adına doğrudan IDE'nin yerleşik araçları (`view_file`, `replace_file_content`, `write_to_file`) tercih edilmelidir.

## Tasarım & Stil Standartları

### Buton Sistemi
- **Temel & Nötr Butonlar (`.btn`)**: Standart nötr butonlar doğrudan `.btn` sınıfını kullanır. Ayrı bir `.btn-secondary` sınıfı kullanılmaz; `.btn` varsayılan nötr stildir. Varsayılan (default) butonların içerik (metin ve ikon) opaklık değeri %50 (`rgba(241, 241, 241, 0.5)`), hover yapıldığında ise %80 (`rgba(255, 255, 255, 0.8)`) olur. İkon rengi normal, hover ve active durumlarında her zaman metin rengiyle birebir aynıdır (`color: inherit`).
- **Sabit Boyut Yasağı & İçerik Bazlı Boyutlandırma**: Butonlara kesinlikle sabit `width`, `height` veya `min-height` uygulanmaz (`width: auto`, `height: auto`). Buton boyutları her zaman içerik (metin veya ikon) baz alınarak, text boyutu (`font-size`, `line-height`) ve `padding` ile doğal olarak oluşturulur.
- **İkon Butonları**: Ayrı bir `.btn-icon` sınıfına gerek yoktur. İçinde metin bulunmayıp yalnızca ikon olan butonlar CSS `:has()` kuralıyla otomatik olarak ikon butonuna dönüşür. Sabit kare ölçüsü yerine ikonun font boyutu ve padding'i baz alınır.
- **Vurgu ve Tehlike Butonları**: Birincil eylemler için `.btn.btn-primary`, silme/iptal gibi riskli işlemler için `.btn.btn-danger` kullanılır.
- **Sayfalama (`.pagination-btn`)**: Sayfalama butonları buton sistemine entegredir; `.btn.btn-sm.pagination-btn` (aktif sayfa için `.btn.btn-primary.btn-sm.pagination-btn`) kullanılır ve min-height içermez.

### Sekme & Katman Seçiciler (`.tab-btn`)
- Kenar çubuğu sekmeleri ve Karşılama Kartı katman listesi için ana referans `.tab-btn` sınıfıdır (`.layer-btn` bu sınıfa birleştirilmiştir).
- Hover yapıldığında buton ikonu ve metni aynı anda `#ffffff` beyaz rengi alır.

### Dropdown / Özel Açılır Menüler (`.dropdown` & `.dropdown-sm`)
- Açılır menülerde ana sınıf adı `.dropdown`, kompakt boyut için `.dropdown-sm` kullanılır.
- Alt bileşenler `.dropdown-trigger`, `.dropdown-menu`, `.dropdown-option` olarak adlandırılır (geriye dönük tam uyumluluk için `.custom-select-*` takma adları korunmuştur).
- Tüm yeni select menüleri standart tarayıcı görünümü yerine bu modern dropdown bileşenini kullanmalıdır.

### Tablo Sistemi (`.data-table`)
- Veri tablolarında dış kapsayıcı için tek `.data-table` sınıfı yeterlidir (`.data-table-wrapper` yerine doğrudan `.data-table` kullanılır). İçindeki `table`, `thead`, `th`, `td` ve `tbody tr` stilleri otomatik olarak uygulanır.

### Switch (Aç/Kapa) & Modern Slider
- **`.switch`**: Kapalı durumunda %10 opaklıklı sarı outline (`rgba(255, 224, 0, 0.1)`) bulunur. Renk mantığı ters çalışır: Kapalıyken koyu zemin üzerine sarı buton, açıkken sarı zemin üzerine koyu buton yer alır.
- **`.modern-slider`**: Kaydırma çubuğu izi etrafında %10 opaklıklı sarı outline (`rgba(255, 224, 0, 0.1)`) bulunur.
