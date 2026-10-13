// ============================================================
//  Bot Yönetim Paneli - İstemci Tarafı
// ============================================================

const FONT_FAMILY = "Segoe UI, Arial, sans-serif"; // Sunucudaki cardRenderer.ts ile aynı

const state = {
  guilds: [],
  selectedGuildId: null,
  settings: null,
  bot: null,
  channels: [],
  selected: "avatar", // "avatar" | "background" | text layer id
  dirty: false,
};

const $ = (sel) => document.querySelector(sel);
const canvas = $("#card-canvas");
const ctx = canvas.getContext("2d");

// ---------------- Yardımcılar ----------------

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res;
}

/** Font Awesome ikon etiketi üretir: icon("floppy-disk") */
const icon = (name, extra = "") => `<i class="fa-solid fa-${name} ${extra}"></i>`;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function toast(message, type = "success") {
  const el = $("#toast");
  el.innerHTML = `${icon(type === "error" ? "circle-xmark" : "circle-check", "mr-2")}${escapeHtml(message)}`;
  el.className = `fixed bottom-6 right-6 px-4 py-3 rounded shadow-lg text-[#141414] font-semibold border z-50 ${
    type === "error" ? "bg-[#e53935] text-white border-red-700" : "bg-[#FFE000] border-[#FFE000]"
  }`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function setSaveStatus(html, cls) {
  $("#save-status").innerHTML = html;
  $("#save-status").className = `text-sm ${cls}`;
}

function markDirty() {
  state.dirty = true;
  setSaveStatus(`${icon("circle-exclamation", "mr-1 text-[#FFE000]")} Kaydedilmemiş değişiklikler`, "text-[#FFE000]");
}

/**
 * Tarayıcının varsayılan kaba select menüsü yerine,
 * site tasarımına birebir uyan, sarı vurgulu ve özel kaydırma çubuklu modern dropdown üretir.
 */
/**
 * Tarayıcının varsayılan kaba select menüsü yerine,
 * site tasarımına birebir uyan, sarı vurgulu ve özel kaydırma çubuklu modern dropdown üretir.
 */
function createCustomSelect(selectEl) {
  if (!selectEl) return null;

  let wrapper = selectEl.closest(".custom-select-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "custom-select-wrapper";
    if (selectEl.classList.contains("flex-1")) {
      wrapper.classList.add("flex-1", "min-w-0");
    }
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    selectEl.style.display = "none";
  }

  // Önceki trigger ve menu varsa temizle
  const oldTrigger = wrapper.querySelector(".custom-select-trigger");
  if (oldTrigger) oldTrigger.remove();
  const oldMenu = wrapper.querySelector(".custom-select-menu");
  if (oldMenu) oldMenu.remove();

  const trigger = document.createElement("div");
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("role", "button");
  trigger.setAttribute("tabindex", "0");

  const triggerText = document.createElement("span");
  triggerText.className = "truncate mr-2 pointer-events-none";

  // Mevcut seçili metni bul
  let currentText = "Seçin...";
  for (let i = 0; i < selectEl.options.length; i++) {
    const o = selectEl.options[i];
    if (o.value === selectEl.value || (selectEl.selectedIndex === i && !selectEl.value && !o.value)) {
      currentText = o.text;
      break;
    }
  }
  if (currentText === "Seçin..." && selectEl.options.length > 0) {
    currentText = selectEl.options[0].text;
  }
  triggerText.textContent = currentText;
  if (selectEl.dataset.type === "font" && selectEl.value) {
    triggerText.style.fontFamily = `"${selectEl.value}", Arial, sans-serif`;
  }

  const arrow = document.createElement("i");
  arrow.className = "fa-solid fa-chevron-down arrow-icon pointer-events-none";

  trigger.append(triggerText, arrow);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";

  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    const isSelected = opt.value === selectEl.value || (!selectEl.value && !opt.value && i === 0);

    const item = document.createElement("div");
    item.className = `custom-select-option ${isSelected ? "selected" : ""}`;
    item.dataset.value = opt.value;

    const labelSpan = document.createElement("span");
    labelSpan.className = "truncate pointer-events-none";
    labelSpan.textContent = opt.text;
    if (selectEl.dataset.type === "font" && opt.value) {
      labelSpan.style.fontFamily = `"${opt.value}", Arial, sans-serif`;
    }
    item.appendChild(labelSpan);

    if (isSelected) {
      const check = document.createElement("i");
      check.className = "fa-solid fa-check text-xs ml-2 text-[#FFE000] pointer-events-none";
      item.appendChild(check);
    }

    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      selectEl.value = opt.value;
      triggerText.textContent = opt.text;
      if (selectEl.dataset.type === "font" && opt.value) {
        triggerText.style.fontFamily = `"${opt.value}", Arial, sans-serif`;
      }

      menu.querySelectorAll(".custom-select-option").forEach((o) => {
        o.classList.remove("selected");
        const ch = o.querySelector(".fa-check");
        if (ch) ch.remove();
      });
      item.classList.add("selected");

      const check = document.createElement("i");
      check.className = "fa-solid fa-check text-xs ml-2 text-[#FFE000] pointer-events-none";
      item.appendChild(check);

      wrapper.classList.remove("open");

      // Değişiklik olaylarını ilet
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    menu.appendChild(item);
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isOpen = wrapper.classList.contains("open");
    document.querySelectorAll(".custom-select-wrapper.open").forEach((w) => {
      w.classList.remove("open");
    });
    if (!isOpen) {
      wrapper.classList.add("open");
    }
  });

  // Klavyeyle açma desteği (Enter veya Boşluk)
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      trigger.click();
    } else if (e.key === "Escape") {
      wrapper.classList.remove("open");
    }
  });

  wrapper.append(trigger, menu);
  return wrapper;
}

// Dışarı tıklandığında açık dropdownları kapat
document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select-wrapper.open").forEach((w) => {
    w.classList.remove("open");
  });
});

function applyPlaceholders(text) {
  const b = state.bot || {};
  return text
    .replaceAll("{username}", b.username || "Kullanıcı")
    .replaceAll("{displayName}", b.displayName || "Kullanıcı")
    .replaceAll("{server}", b.serverName || "Sunucu")
    .replaceAll("{memberCount}", String(b.memberCount ?? 100));
}

// Görsel önbelleği: yüklenince tuvali yeniden çizer
const imageCache = new Map();
function getImage(src) {
  if (!src) return null;
  if (!imageCache.has(src)) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => draw();
    img.onerror = () => console.warn("Görsel yüklenemedi:", src);
    img.src = src;
    imageCache.set(src, img);
  }
  const img = imageCache.get(src);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

const card = () => state.settings.welcome.card;
const selectedText = () => card().texts.find((t) => t.id === state.selected);

// ---------------- Tuval Çizimi ----------------

function getLayerBounds(layerId) {
  const c = card();
  if (layerId === "avatar") {
    const a = c.avatar;
    return { x: a.x - a.size / 2, y: a.y - a.size / 2, w: a.size, h: a.size };
  }
  const t = c.texts.find((l) => l.id === layerId);
  if (!t) return null;
  const style = t.fontStyle === "italic" ? "italic" : "normal";
  const weight = t.fontWeight || "normal";
  const family = t.fontFamily ? `"${t.fontFamily}", Arial, sans-serif` : FONT_FAMILY;
  ctx.font = `${style} ${weight} ${t.fontSize}px ${family}`;
  let text = applyPlaceholders(t.text);
  if (t.uppercase) text = text.toUpperCase();
  const w = Math.max(ctx.measureText(text).width, 10);
  const h = t.fontSize * 1.2;
  const x = t.align === "center" ? t.x - w / 2 : t.align === "right" ? t.x - w : t.x;
  return { x, y: t.y - h / 2, w, h };
}

function draw() {
  if (!state.settings) return;
  const c = card();
  canvas.width = c.width;
  canvas.height = c.height;

  // Arka plan
  ctx.fillStyle = c.background.color;
  ctx.fillRect(0, 0, c.width, c.height);
  const bg = getImage(c.background.imageUrl);
  if (bg) {
    const scale = Math.max(c.width / bg.width, c.height / bg.height);
    const w = bg.width * scale, h = bg.height * scale;
    ctx.drawImage(bg, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }
  if (c.background.overlayOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = c.background.overlayOpacity;
    ctx.fillStyle = c.background.overlayColor;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
  }

  // Avatar
  const a = c.avatar;
  if (a.enabled) {
    const r = a.size / 2;
    const shape = () => {
      ctx.beginPath();
      if (a.shape === "circle") ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      else ctx.rect(a.x - r, a.y - r, a.size, a.size);
      ctx.closePath();
    };
    ctx.save();
    shape();
    ctx.clip();
    const img = getImage(state.bot?.avatarUrl);
    if (img) ctx.drawImage(img, a.x - r, a.y - r, a.size, a.size);
    else { ctx.fillStyle = "#5865f2"; ctx.fill(); }
    ctx.restore();
    if (a.borderWidth > 0) {
      ctx.save();
      shape();
      ctx.lineWidth = a.borderWidth;
      ctx.strokeStyle = a.borderColor;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Metinler
  for (const t of c.texts) {
    ctx.save();
    const style = t.fontStyle === "italic" ? "italic" : "normal";
    const weight = t.fontWeight || "normal";
    const family = t.fontFamily ? `"${t.fontFamily}", Arial, sans-serif` : FONT_FAMILY;
    ctx.font = `${style} ${weight} ${t.fontSize}px ${family}`;
    ctx.fillStyle = t.color;
    ctx.textAlign = t.align;
    ctx.textBaseline = "middle";

    let textStr = applyPlaceholders(t.text);
    if (t.uppercase) textStr = textStr.toUpperCase();

    if (t.shadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    }

    if (t.stroke && (t.strokeWidth || 0) > 0) {
      ctx.save();
      ctx.strokeStyle = t.strokeColor || "#000000";
      ctx.lineWidth = t.strokeWidth || 2;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeText(textStr, t.x, t.y);
      ctx.restore();
    }

    ctx.fillText(textStr, t.x, t.y);

    if (t.underline) {
      const textWidth = ctx.measureText(textStr).width;
      let lineX = t.x;
      if (t.align === "center") lineX = t.x - textWidth / 2;
      else if (t.align === "right") lineX = t.x - textWidth;
      const lineY = t.y + t.fontSize * 0.55;
      ctx.save();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(1, Math.round(t.fontSize / 16));
      ctx.beginPath();
      ctx.moveTo(lineX, lineY);
      ctx.lineTo(lineX + textWidth, lineY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Seçim çerçevesi (sadece editörde görünür)
  const b = state.selected !== "background" && getLayerBounds(state.selected);
  if (b && (state.selected !== "avatar" || a.enabled)) {
    ctx.save();
    ctx.strokeStyle = "#FFE000";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.restore();
  }

  // Ortalama kılavuzu (sürüklerken ortaya yaklaşınca)
  if (drag && drag.snapX) {
    ctx.save();
    ctx.strokeStyle = "#FFE000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c.width / 2, 0);
    ctx.lineTo(c.width / 2, c.height);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------- Sürükle & Bırak ----------------

let drag = null;

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitTest(p) {
  const c = card();
  // Üstteki katmandan alttakine doğru
  for (const t of [...c.texts].reverse()) {
    const b = getLayerBounds(t.id);
    if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) return t.id;
  }
  if (c.avatar.enabled) {
    const a = c.avatar;
    if (Math.hypot(p.x - a.x, p.y - a.y) <= a.size / 2 + 6) return "avatar";
  }
  return null;
}

function layerObject(id) {
  return id === "avatar" ? card().avatar : card().texts.find((t) => t.id === id);
}

canvas.addEventListener("pointerdown", (e) => {
  const p = canvasPoint(e);
  const hit = hitTest(p);
  selectLayer(hit || "background");
  if (!hit) return;
  const obj = layerObject(hit);
  drag = { id: hit, dx: p.x - obj.x, dy: p.y - obj.y, snapX: false };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  const p = canvasPoint(e);
  if (!drag) {
    canvas.style.cursor = hitTest(p) ? "move" : "default";
    return;
  }
  const obj = layerObject(drag.id);
  let x = Math.round(p.x - drag.dx);
  const y = Math.round(p.y - drag.dy);
  const center = Math.round(card().width / 2);
  drag.snapX = Math.abs(x - center) < 8; // Yatay ortaya mıknatıs
  if (drag.snapX) x = center;
  obj.x = x;
  obj.y = y;
  markDirty();
  draw();
  syncPositionInputs();
});

canvas.addEventListener("pointerup", () => {
  drag = null;
  draw();
});

document.addEventListener("keydown", (e) => {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if ($("#tab-welcome").classList.contains("hidden")) return;
  const obj = layerObject(state.selected);
  if (!obj) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  if (e.key === "ArrowUp") obj.y -= step;
  if (e.key === "ArrowDown") obj.y += step;
  if (e.key === "ArrowLeft") obj.x -= step;
  if (e.key === "ArrowRight") obj.x += step;
  markDirty();
  draw();
  syncPositionInputs();
});

// ---------------- Katman & Özellik Paneli ----------------

function renderLayerList() {
  const list = $("#layer-list");
  list.innerHTML = "";
  const items = [
    { id: "background", label: `${icon("image", "mr-2 text-zinc-400")} Arka Plan` },
    { id: "avatar", label: `${icon("user", "mr-2 text-zinc-400")} Profil Fotoğrafı` },
    ...card().texts.map((t) => ({ id: t.id, label: `${icon("font", "mr-2 text-zinc-400")} ${escapeHtml(t.text || "(boş metin)")}` })),
  ];
  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = `layer-btn w-full text-left text-sm px-3 py-1.5 rounded truncate flex items-center ${
      state.selected === item.id ? "active" : ""
    }`;
    btn.innerHTML = item.label;
    btn.onclick = () => selectLayer(item.id);
    list.appendChild(btn);
  }
}

function selectLayer(id) {
  state.selected = id;
  renderLayerList();
  renderProps();
  draw();
}

/** Tek satırlık form alanı oluşturur ve nesnenin ilgili anahtarına bağlar */
function field(obj, key, label, type = "text", opts = {}) {
  const wrap = document.createElement(type === "checkbox" ? "label" : "div");
  wrap.className = `block space-y-1 ${opts.half ? "" : "col-span-2"}`;
  wrap.innerHTML = `<span class="field-label text-zinc-400">${label}</span>`;

  let input;
  if (type === "select") {
    input = document.createElement("select");
    if (opts.isFont) input.dataset.type = "font";
    for (const [value, text] of opts.options) input.add(new Option(text, value));
    input.value = obj[key] || (opts.options[0] ? opts.options[0][0] : "");
    wrap.appendChild(input);
  } else if (type === "checkbox") {
    wrap.className = `flex items-center justify-between gap-3 bg-[#141414] p-2.5 rounded border border-[#262626] ${opts.half ? "" : "col-span-2"}`;
    wrap.innerHTML = `<span class="text-sm font-medium text-[#F1F1F1] select-none">${label}</span>`;
    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = obj[key];
    const track = document.createElement("span");
    track.className = "switch-track";
    const thumb = document.createElement("span");
    thumb.className = "switch-thumb";
    switchLabel.append(input, track, thumb);
    wrap.appendChild(switchLabel);
  } else if (type === "range") {
    wrap.className = `block space-y-1.5 ${opts.half ? "" : "col-span-2"}`;
    const min = opts.min !== undefined ? opts.min : 0;
    const max = opts.max !== undefined ? opts.max : 1;
    const initialVal = obj[key];
    const initialPercent = Math.round(((initialVal - min) / (max - min)) * 100);

    wrap.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="field-label text-zinc-400">${label}</span>
        <span class="range-val text-xs font-semibold px-1.5 py-0.5 rounded bg-[#141414] text-[#FFE000] border border-[#262626]">%${initialPercent}</span>
      </div>
    `;

    input = document.createElement("input");
    input.type = "range";
    input.className = "modern-slider";
    input.value = initialVal;
    input.min = min;
    input.max = max;
    if (opts.step !== undefined) input.step = opts.step;

    const valBadge = wrap.querySelector(".range-val");
    const updateSliderFill = () => {
      const p = Math.round(((Number(input.value) - min) / (max - min)) * 100);
      input.style.background = `linear-gradient(to right, #FFE000 0%, #FFE000 ${p}%, #141414 ${p}%, #141414 100%)`;
      if (valBadge) valBadge.textContent = `%${p}`;
    };

    updateSliderFill();
    input.addEventListener("input", updateSliderFill);
    wrap.appendChild(input);
  } else if (type === "color") {
    wrap.className = `block space-y-1 ${opts.half ? "" : "col-span-2"}`;
    wrap.innerHTML = `<span class="field-label text-zinc-400">${label}</span>`;

    const colorContainer = document.createElement("div");
    colorContainer.className = "flex items-center bg-[#141414] border border-[#262626] rounded-lg px-2.5 py-1 gap-2.5 h-[38px] focus-within:border-[#FFE000] focus-within:ring-1 focus-within:ring-[#FFE000] transition group";

    const swatchBox = document.createElement("div");
    swatchBox.className = "w-6 h-6 rounded-md border border-[#333333] shrink-0 relative overflow-hidden cursor-pointer shadow-inner flex items-center justify-center transition hover:scale-105";
    swatchBox.style.backgroundColor = obj[key] || "#000000";

    input = document.createElement("input");
    input.type = "color";
    input.value = obj[key] || "#000000";
    input.className = "absolute inset-0 opacity-0 w-full h-full cursor-pointer";
    swatchBox.appendChild(input);

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.maxLength = 7;
    hexInput.value = (obj[key] || "#000000").toUpperCase();
    hexInput.className = "flex-1 min-w-0 bg-transparent text-[#F1F1F1] text-xs font-semibold uppercase tracking-wider outline-none";
    hexInput.placeholder = "#000000";

    const syncColor = (val) => {
      let formatted = val.trim();
      if (!formatted.startsWith("#")) formatted = "#" + formatted;
      if (/^#[0-9A-Fa-f]{6}$/.test(formatted)) {
        input.value = formatted;
        swatchBox.style.backgroundColor = formatted;
        obj[key] = formatted;
        markDirty();
        draw();
        if (opts.onChange) opts.onChange();
      }
    };

    input.addEventListener("input", () => {
      swatchBox.style.backgroundColor = input.value;
      hexInput.value = input.value.toUpperCase();
      obj[key] = input.value;
      markDirty();
      draw();
      if (opts.onChange) opts.onChange();
    });

    hexInput.addEventListener("input", () => {
      syncColor(hexInput.value);
    });

    hexInput.addEventListener("blur", () => {
      hexInput.value = (obj[key] || "#000000").toUpperCase();
    });

    colorContainer.append(swatchBox, hexInput);

    if (window.EyeDropper) {
      const eyedropperBtn = document.createElement("button");
      eyedropperBtn.type = "button";
      eyedropperBtn.title = "Ekrandan Renk Seç (Damlalık)";
      eyedropperBtn.className = "w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-[#FFE000] transition text-xs shrink-0";
      eyedropperBtn.innerHTML = `<i class="fa-solid fa-eye-dropper"></i>`;
      eyedropperBtn.onclick = async (e) => {
        e.preventDefault();
        try {
          const dropper = new EyeDropper();
          const result = await dropper.open();
          if (result && result.sRGBHex) {
            syncColor(result.sRGBHex);
            hexInput.value = result.sRGBHex.toUpperCase();
          }
        } catch {
          // İptal edildiğinde hata verme
        }
      };
      colorContainer.appendChild(eyedropperBtn);
    }

    wrap.appendChild(colorContainer);
    return wrap;
  } else {
    input = document.createElement("input");
    input.type = type;
    input.value = obj[key];
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
  }

  if (type !== "checkbox" && type !== "range" && type !== "select") {
    const isNumber = type === "number";
    input.className = `w-full bg-[#141414] border border-[#262626] text-[#F1F1F1] rounded-lg px-3 py-2 text-sm focus:border-[#FFE000] focus:ring-1 focus:ring-[#FFE000] outline-none transition ${isNumber ? "font-semibold" : ""}`;
    wrap.appendChild(input);
  }
  if (opts.dataKey) input.dataset.key = opts.dataKey;

  const onValueChange = () => {
    if (type === "checkbox") obj[key] = input.checked;
    else if (type === "number" || type === "range") obj[key] = Number(input.value);
    else obj[key] = input.value;
    markDirty();
    draw();
    if (opts.onChange) opts.onChange();
  };

  input.addEventListener("input", onValueChange);
  input.addEventListener("change", onValueChange);

  if (type === "select") {
    createCustomSelect(input);
  }

  return wrap;
}

function grid(...children) {
  const g = document.createElement("div");
  g.className = "grid grid-cols-2 gap-3";
  g.append(...children);
  return g;
}

function button(label, onClick, cls = "bg-zinc-800 hover:bg-zinc-700 text-[#F1F1F1] border border-[#262626]") {
  const b = document.createElement("button");
  b.className = `${cls} px-3 py-1.5 rounded text-sm col-span-2 flex items-center justify-center gap-2 transition`;
  b.innerHTML = label;
  b.onclick = onClick;
  return b;
}

function syncPositionInputs() {
  const obj = layerObject(state.selected);
  if (!obj) return;
  const xi = document.querySelector('[data-key="pos-x"]');
  const yi = document.querySelector('[data-key="pos-y"]');
  if (xi) xi.value = obj.x;
  if (yi) yi.value = obj.y;
}

const FONT_OPTIONS = [
  ["Segoe UI", "Segoe UI (Varsayılan)"],
  ["Impact", "Impact (Güçlü Başlık)"],
  ["Bahnschrift", "Bahnschrift (Modern / Geometrik)"],
  ["Arial", "Arial (Klasik Sans)"],
  ["Trebuchet MS", "Trebuchet MS (Okunabilir)"],
  ["Verdana", "Verdana (Geniş & Net)"],
  ["Franklin Gothic Medium", "Franklin Gothic (Manşet)"],
  ["Georgia", "Georgia (Zarif Tırnaklı)"],
  ["Cascadia Code", "Cascadia Code (Monospace)"],
  ["Consolas", "Consolas (Kod Yazı Tipi)"],
  ["Comic Sans MS", "Comic Sans MS (Eğlenceli)"],
];

function formatPicker(t) {
  const wrap = document.createElement("div");
  wrap.className = "block space-y-1";
  wrap.innerHTML = `<span class="field-label text-zinc-400">Yazı Biçimi</span>`;

  const group = document.createElement("div");
  group.className = "grid grid-cols-4 bg-[#141414] border border-[#262626] rounded-lg p-1 gap-1 h-[38px]";

  const options = [
    {
      id: "bold",
      label: `<i class="fa-solid fa-bold"></i>`,
      title: "Kalın (Bold)",
      isActive: () => t.fontWeight === "bold",
      toggle: () => {
        t.fontWeight = t.fontWeight === "bold" ? "normal" : "bold";
      },
    },
    {
      id: "italic",
      label: `<i class="fa-solid fa-italic"></i>`,
      title: "İtalik (Italic)",
      isActive: () => t.fontStyle === "italic",
      toggle: () => {
        t.fontStyle = t.fontStyle === "italic" ? "normal" : "italic";
      },
    },
    {
      id: "underline",
      label: `<i class="fa-solid fa-underline"></i>`,
      title: "Altı Çizili (Underline)",
      isActive: () => !!t.underline,
      toggle: () => {
        t.underline = !t.underline;
      },
    },
    {
      id: "uppercase",
      label: `<span class="font-bold text-xs tracking-tighter">TT</span>`,
      title: "Büyük Harf (Uppercase)",
      isActive: () => !!t.uppercase,
      toggle: () => {
        t.uppercase = !t.uppercase;
      },
    },
  ];

  const buttons = [];

  const updateButtons = () => {
    buttons.forEach(({ btn, opt }) => {
      const active = opt.isActive();
      btn.className = `h-full rounded flex items-center justify-center transition text-sm ${
        active
          ? "bg-[#FFE000]/15 text-[#FFE000] font-semibold"
          : "text-zinc-400 hover:text-[#F1F1F1] hover:bg-[#262626]"
      }`;
    });
  };

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = opt.title;
    btn.innerHTML = opt.label;
    btn.onclick = (e) => {
      e.preventDefault();
      opt.toggle();
      updateButtons();
      markDirty();
      draw();
    };
    buttons.push({ btn, opt });
    group.appendChild(btn);
  }

  updateButtons();
  wrap.appendChild(group);
  return wrap;
}

function alignPicker(t) {
  const wrap = document.createElement("div");
  wrap.className = "block space-y-1";
  wrap.innerHTML = `<span class="field-label text-zinc-400">Hizalama</span>`;

  const group = document.createElement("div");
  group.className = "grid grid-cols-3 bg-[#141414] border border-[#262626] rounded-lg p-1 gap-1 h-[38px]";

  const options = [
    { value: "left", iconName: "align-left", title: "Sola Hizala" },
    { value: "center", iconName: "align-center", title: "Ortala" },
    { value: "right", iconName: "align-right", title: "Sağa Hizala" },
  ];

  const buttons = [];

  const updateButtons = () => {
    buttons.forEach(({ btn, value }) => {
      const isActive = t.align === value;
      btn.className = `h-full rounded flex items-center justify-center transition text-sm ${
        isActive
          ? "bg-[#FFE000]/15 text-[#FFE000] font-semibold"
          : "text-zinc-400 hover:text-[#F1F1F1] hover:bg-[#262626]"
      }`;
    });
  };

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = opt.title;
    btn.innerHTML = `<i class="fa-solid fa-${opt.iconName}"></i>`;
    btn.onclick = (e) => {
      e.preventDefault();
      t.align = opt.value;
      updateButtons();
      markDirty();
      draw();
    };
    buttons.push({ btn, value: opt.value });
    group.appendChild(btn);
  }

  updateButtons();
  wrap.appendChild(group);
  return wrap;
}

function shapePicker(a) {
  const wrap = document.createElement("div");
  wrap.className = "block space-y-1";
  wrap.innerHTML = `<span class="field-label text-zinc-400">Şekil</span>`;

  const group = document.createElement("div");
  group.className = "grid grid-cols-2 bg-[#141414] border border-[#262626] rounded-lg p-1 gap-1 h-[38px]";

  const options = [
    { value: "circle", iconName: "circle", title: "Yuvarlak (Daire)" },
    { value: "square", iconName: "square", title: "Kare" },
  ];

  const buttons = [];

  const updateButtons = () => {
    const currentShape = a.shape || "circle";
    buttons.forEach(({ btn, value }) => {
      const isActive = currentShape === value;
      btn.className = `h-full rounded flex items-center justify-center transition text-sm ${
        isActive
          ? "bg-[#FFE000]/15 text-[#FFE000] font-semibold"
          : "text-zinc-400 hover:text-[#F1F1F1] hover:bg-[#262626]"
      }`;
    });
  };

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = opt.title;
    btn.innerHTML = `<i class="fa-solid fa-${opt.iconName}"></i>`;
    btn.onclick = (e) => {
      e.preventDefault();
      a.shape = opt.value;
      updateButtons();
      markDirty();
      draw();
    };
    buttons.push({ btn, value: opt.value });
    group.appendChild(btn);
  }

  updateButtons();
  wrap.appendChild(group);
  return wrap;
}

function dimensionPresets(c) {
  const wrap = document.createElement("div");
  wrap.className = "col-span-2 space-y-1.5";
  wrap.innerHTML = `<span class="field-label text-zinc-400">Hazır Boyut Şablonları</span>`;

  const group = document.createElement("div");
  group.className = "grid grid-cols-3 gap-2";

  const presets = [
    { label: "800 × 400", sub: "Standart (2:1)", w: 800, h: 400 },
    { label: "1024 × 512", sub: "Geniş HD", w: 1024, h: 512 },
    { label: "960 × 540", sub: "16:9 Banner", w: 960, h: 540 },
  ];

  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isCurrent = c.width === p.w && c.height === p.h;
    btn.className = `p-2 rounded-lg border text-left transition ${
      isCurrent
        ? "bg-[#FFE000]/15 border-[#FFE000]/40 text-[#FFE000]"
        : "bg-[#141414] border-[#262626] text-zinc-300 hover:border-[#3b3b3b] hover:text-[#F1F1F1]"
    }`;
    btn.innerHTML = `
      <div class="text-xs font-bold">${p.label}</div>
      <div class="text-[10px] text-zinc-400 mt-0.5">${p.sub}</div>
    `;
    btn.onclick = (e) => {
      e.preventDefault();
      c.width = p.w;
      c.height = p.h;
      markDirty();
      renderProps();
      draw();
    };
    group.appendChild(btn);
  });

  wrap.appendChild(group);
  return wrap;
}

function renderProps() {
  const panel = $("#props-panel");
  panel.innerHTML = "";
  const c = card();

  if (state.selected === "background") {
    $("#props-title").innerHTML = `${icon("image", "mr-1 text-[#FFE000]")} Arka Plan & Boyut`;
    const bg = c.background;

    const upload = document.createElement("input");
    upload.type = "file";
    upload.accept = "image/png,image/jpeg,image/webp,image/gif";
    upload.className = "hidden";
    upload.onchange = async () => {
      const file = upload.files[0];
      if (!file) return;
      if (file.size > 7 * 1024 * 1024) return toast("Görsel en fazla 7 MB olabilir.", "error");
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      try {
        const res = await api("/api/upload", { method: "POST", body: JSON.stringify({ dataUrl }) });
        bg.imageUrl = (await res.json()).url;
        markDirty();
        renderProps();
        draw();
        toast("Arka plan yüklendi.");
      } catch (err) {
        toast(err.message, "error");
      }
    };

    panel.append(
      grid(
        field(c, "width", "Genişlik (px)", "number", { half: true, min: 200, max: 2000, onChange: draw }),
        field(c, "height", "Yükseklik (px)", "number", { half: true, min: 100, max: 1200, onChange: draw }),
        dimensionPresets(c),
        field(bg, "color", "Arka Plan Rengi", "color"),
        field(bg, "imageUrl", "Arka Plan Görseli (URL)", "text"),
        upload,
        button(`${icon("upload")} Bilgisayardan Görsel Yükle`, () => upload.click()),
        ...(bg.imageUrl ? [button(`${icon("trash-can")} Görseli Kaldır`, () => { bg.imageUrl = ""; markDirty(); renderProps(); draw(); }, "bg-zinc-800 hover:bg-zinc-700 text-[#F1F1F1] border border-[#262626]")] : []),
        field(bg, "overlayColor", "Karartma Rengi", "color", { half: true }),
        field(bg, "overlayOpacity", "Karartma Opaklığı", "range", { half: true, min: 0, max: 1, step: 0.05 })
      )
    );
    return;
  }

  if (state.selected === "avatar") {
    $("#props-title").innerHTML = `${icon("user", "mr-1 text-[#FFE000]")} Profil Fotoğrafı`;
    const a = c.avatar;
    panel.append(
      grid(
        field(a, "enabled", "Profil fotoğrafını göster", "checkbox"),
        field(a, "x", "X (merkez)", "number", { half: true, dataKey: "pos-x" }),
        field(a, "y", "Y (merkez)", "number", { half: true, dataKey: "pos-y" }),
        field(a, "size", "Boyut", "number", { half: true, min: 16, max: 1000 }),
        shapePicker(a),
        field(a, "borderWidth", "Kenarlık Kalınlığı", "number", { half: true, min: 0, max: 50 }),
        field(a, "borderColor", "Kenarlık Rengi", "color", { half: true }),
        button(`${icon("arrows-left-right-to-line")} Yatayda Ortala`, () => { a.x = Math.round(c.width / 2); markDirty(); renderProps(); draw(); })
      )
    );
    return;
  }

  const t = selectedText();
  if (!t) return selectLayer("background");
  $("#props-title").innerHTML = `${icon("font", "mr-1 text-[#FFE000]")} Metin Özellikleri`;
  panel.append(
    grid(
      field(t, "text", "Metin", "text", { onChange: renderLayerList }),
      field(t, "fontFamily", "Yazı Tipi (Font)", "select", { options: FONT_OPTIONS, isFont: true }),
      field(t, "x", "X", "number", { half: true, dataKey: "pos-x" }),
      field(t, "y", "Y", "number", { half: true, dataKey: "pos-y" }),
      field(t, "fontSize", "Yazı Boyutu", "number", { half: true, min: 8, max: 200 }),
      field(t, "color", "Renk", "color", { half: true }),
      formatPicker(t),
      alignPicker(t),
      field(t, "shadow", "Gölge", "checkbox", { half: true }),
      field(t, "stroke", "Dış Çizgi (Kenarlık)", "checkbox", { half: true, onChange: renderProps }),
      ...(t.stroke ? [
        field(t, "strokeColor", "Çizgi Rengi", "color", { half: true }),
        field(t, "strokeWidth", "Çizgi Kalınlığı (px)", "number", { half: true, min: 1, max: 20, step: 1 })
      ] : []),
      button(`${icon("arrows-left-right-to-line")} Yatayda Ortala`, () => { t.x = Math.round(c.width / 2); t.align = "center"; markDirty(); renderProps(); draw(); }),
      button(`${icon("trash-can")} Metni Sil`, () => {
        c.texts = c.texts.filter((l) => l.id !== t.id);
        markDirty();
        selectLayer("background");
      }, "bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50")
    )
  );
}

$("#add-text-btn").onclick = () => {
  const c = card();
  const id = `text-${Date.now()}`;
  c.texts.push({
    id, text: "Yeni Metin", x: Math.round(c.width / 2), y: Math.round(c.height / 2),
    fontSize: 32, fontFamily: "Segoe UI", color: "#ffffff", fontWeight: "normal", fontStyle: "normal",
    underline: false, uppercase: false, align: "center", shadow: true,
    stroke: false, strokeColor: "#000000", strokeWidth: 3,
  });
  markDirty();
  selectLayer(id);
};

// ---------------- Genel Formlar ----------------

function fillChannelSelects() {
  const selects = [...document.querySelectorAll(".channel-select")];
  const msgTarget = $("#msg-target-channel");
  if (msgTarget && !selects.includes(msgTarget)) selects.push(msgTarget);

  for (const select of selects) {
    const currentVal = select.value;
    select.innerHTML = "";
    select.add(new Option("— Kanal seçin —", ""));
    // Seçili sunucunun kanallarını filtrele
    const filtered = state.channels.filter((ch) => !state.selectedGuildId || ch.guildId === state.selectedGuildId);
    // Yalnızca kaynak/izleme seçicilerinde forum kanalları listelenebilir (Hedef kanallar sadece metin kanalı olmalıdır)
    const allowForum = select.id === "feed-source-channel-select" || select.id === "log-filter-channel-select";

    for (const ch of filtered) {
      if (ch.isForum && !allowForum) continue;

      const prefix = ch.isForum ? "💬 " : "# ";
      const suffix = ch.isForum ? " (Forum)" : "";
      select.appendChild(new Option(`${prefix}${ch.name}${suffix}`, ch.id));
    }
    select.value = currentVal;
    createCustomSelect(select);
  }
}

function bindForms() {
  const s = state.settings;
  if (!s) return;

  // Güvenli varsayılanlar (geriye dönük uyumluluk)
  if (!s.logging) s.logging = { enabled: true, channelId: "" };
  if (!s.logging.channels) {
    s.logging.channels = {
      mode: "single",
      default: s.logging.channelId || "",
      messages: "",
      members: "",
      voice: "",
      moderation: "",
    };
  }
  if (!s.logging.events) {
    s.logging.events = {
      messageDelete: true,
      messageUpdate: true,
      memberJoin: true,
      memberLeave: true,
      memberUpdate: true,
      voiceJoinLeave: true,
      voiceMuteDeafen: true,
      guildBan: true,
    };
  }
  if (!s.logging.filters) {
    s.logging.filters = {
      ignoreBots: true,
      ignoredChannels: [],
    };
  }
  if (!s.logging.appearance) {
    s.logging.appearance = {
      detailLevel: "rich",
      embedColor: "#FFE000",
    };
  }

  const bind = (sel, obj, key, prop = "value") => {
    const el = $(sel);
    if (!el) return;
    el[prop] = obj[key] !== undefined ? obj[key] : "";
    el.oninput = el.onchange = () => {
      obj[key] = el[prop];
      markDirty();
      updateAuditLogBadges();
      updateFeedBadges();
      updateFeedPreview();
    };
    if (el.tagName === "SELECT") {
      createCustomSelect(el);
    }
  };

  // 1. Ana Log Switch & Tek Kanal
  bind("#logging-enabled", s.logging, "enabled", "checked");
  bind("#logging-channel", s.logging, "channelId");

  const mainLogCh = $("#logging-channel");
  if (mainLogCh) {
    mainLogCh.addEventListener("change", () => {
      s.logging.channels.default = mainLogCh.value;
    });
  }

  // 2. Çoklu Kanallar (Multi-Channel Routing)
  bind("#logging-channel-default", s.logging.channels, "default");
  bind("#logging-channel-messages", s.logging.channels, "messages");
  bind("#logging-channel-members", s.logging.channels, "members");
  bind("#logging-channel-voice", s.logging.channels, "voice");
  bind("#logging-channel-moderation", s.logging.channels, "moderation");

  // 3. Modüler Olay Filtreleri (Events)
  bind("#log-event-messageDelete", s.logging.events, "messageDelete", "checked");
  bind("#log-event-messageUpdate", s.logging.events, "messageUpdate", "checked");
  bind("#log-event-memberJoin", s.logging.events, "memberJoin", "checked");
  bind("#log-event-memberLeave", s.logging.events, "memberLeave", "checked");
  bind("#log-event-memberUpdate", s.logging.events, "memberUpdate", "checked");
  bind("#log-event-voiceJoinLeave", s.logging.events, "voiceJoinLeave", "checked");
  bind("#log-event-voiceMuteDeafen", s.logging.events, "voiceMuteDeafen", "checked");
  bind("#log-event-guildBan", s.logging.events, "guildBan", "checked");

  // 4. Akıllı Muafiyetler (Filters)
  bind("#log-filter-ignore-bots", s.logging.filters, "ignoreBots", "checked");
  renderIgnoredChannelsList();

  // 5. Embed Görünüm Ayarları
  bind("#log-appearance-detail-level", s.logging.appearance, "detailLevel");

  const colorInput = $("#log-appearance-color");
  const colorHex = $("#log-appearance-color-hex");
  if (colorInput && colorHex) {
    const curColor = s.logging.appearance.embedColor || "#FFE000";
    colorInput.value = curColor;
    colorHex.value = curColor;
    colorInput.oninput = () => {
      colorHex.value = colorInput.value;
      s.logging.appearance.embedColor = colorInput.value;
      markDirty();
    };
    colorHex.oninput = () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(colorHex.value)) {
        colorInput.value = colorHex.value;
        s.logging.appearance.embedColor = colorHex.value;
        markDirty();
      }
    };
  }

  // 6. Karşılama Ayarları
  bind("#welcome-enabled", s.welcome, "enabled", "checked");
  bind("#welcome-channel", s.welcome, "channelId");
  bind("#welcome-message", s.welcome, "message");

  // 7. Ana Sayfa Gönderi Akışı Ayarları (Feed)
  if (!s.feed) {
    s.feed = {
      enabled: false,
      targetChannelId: "",
      sourceChannelIds: [],
      previewLength: 200,
      minContentLength: 5,
      ignoreBots: true,
      includeImages: true,
      embedColor: "#FFE000",
    };
  }
  if (!Array.isArray(s.feed.sourceChannelIds)) s.feed.sourceChannelIds = [];
  if (typeof s.feed.previewLength !== "number") s.feed.previewLength = 200;
  if (typeof s.feed.minContentLength !== "number") s.feed.minContentLength = 5;
  if (typeof s.feed.ignoreBots !== "boolean") s.feed.ignoreBots = true;
  if (typeof s.feed.includeImages !== "boolean") s.feed.includeImages = true;
  if (!s.feed.embedColor) s.feed.embedColor = "#FFE000";

  bind("#feed-enabled", s.feed, "enabled", "checked");
  bind("#feed-target-channel", s.feed, "targetChannelId");
  bind("#feed-ignore-bots", s.feed, "ignoreBots", "checked");
  bind("#feed-include-images", s.feed, "includeImages", "checked");
  bind("#feed-min-content-length", s.feed, "minContentLength");

  const previewSlider = $("#feed-preview-length");
  const previewVal = $("#feed-preview-length-val");
  if (previewSlider) {
    previewSlider.value = s.feed.previewLength;
    if (previewVal) previewVal.textContent = `${s.feed.previewLength} Karakter`;
    previewSlider.oninput = () => {
      s.feed.previewLength = Number(previewSlider.value);
      if (previewVal) previewVal.textContent = `${previewSlider.value} Karakter`;
      markDirty();
      updateFeedBadges();
      updateFeedPreview();
    };
  }

  const feedColorInput = $("#feed-embed-color");
  const feedColorHex = $("#feed-embed-color-hex");
  if (feedColorInput && feedColorHex) {
    feedColorInput.value = s.feed.embedColor;
    feedColorHex.value = s.feed.embedColor;
    feedColorInput.oninput = () => {
      feedColorHex.value = feedColorInput.value;
      s.feed.embedColor = feedColorInput.value;
      markDirty();
      updateFeedPreview();
    };
    feedColorHex.oninput = () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(feedColorHex.value)) {
        feedColorInput.value = feedColorHex.value;
        s.feed.embedColor = feedColorHex.value;
        markDirty();
        updateFeedPreview();
      }
    };
  }

  // Kanal Modu Arayüzünü Güncelle (Single vs Multi)
  setLogRoutingMode(s.logging.channels.mode || "single", false);

  // Üst Durum Rozetlerini Güncelle
  updateAuditLogBadges();
  renderFeedSourceChannels();
  updateFeedBadges();
  updateFeedPreview();
}

// ---------------- Denetim Kaydı (Audit Log) Yönetimi ----------------

function updateAuditLogBadges() {
  const s = state.settings;
  if (!s || !s.logging) return;

  // Ana Durum
  const activeBadge = $("#log-active-status-badge");
  if (activeBadge) {
    if (s.logging.enabled) {
      activeBadge.textContent = "Aktif";
      activeBadge.className = "text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30";
    } else {
      activeBadge.textContent = "Pasif";
      activeBadge.className = "text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-[#262626]";
    }
  }

  // Mod
  const modeBadge = $("#badge-log-mode");
  if (modeBadge) {
    modeBadge.textContent = s.logging.channels?.mode === "multi" ? "Ayrı Kanallar (4 Kategori)" : "Tek Kanal";
  }

  // Olaylar
  const eventsBadge = $("#badge-log-events");
  if (eventsBadge) {
    const ev = s.logging.events || {};
    const keys = ["messageDelete", "messageUpdate", "memberJoin", "memberLeave", "memberUpdate", "voiceJoinLeave", "voiceMuteDeafen", "guildBan"];
    const activeCount = keys.filter((k) => ev[k] !== false).length;
    eventsBadge.textContent = `${activeCount}/8 Olay Açık`;
    eventsBadge.className = `text-xs font-bold ${activeCount > 0 ? "text-zinc-300" : "text-amber-400"}`;
  }

  // Bot Koruması
  const botBadge = $("#badge-log-bot-filter");
  if (botBadge) {
    const ignore = s.logging.filters?.ignoreBots !== false;
    botBadge.textContent = ignore ? "Botlar Yoksayılıyor" : "Botlar Dahil Ediliyor";
    botBadge.className = `text-xs font-bold ${ignore ? "text-green-400" : "text-amber-400"}`;
  }

  // Görünüm
  const appBadge = $("#badge-log-appearance");
  if (appBadge) {
    const isCompact = s.logging.appearance?.detailLevel === "compact";
    appBadge.textContent = isCompact ? "Kompakt (Sade)" : "Zengin (Detaylı)";
  }
}

function setLogRoutingMode(mode, doMarkDirty = true) {
  if (!state.settings || !state.settings.logging) return;
  if (!state.settings.logging.channels) {
    state.settings.logging.channels = { mode: "single", default: "", messages: "", members: "", voice: "", moderation: "" };
  }
  state.settings.logging.channels.mode = mode;

  const singleBtn = $("#log-mode-single-btn");
  const multiBtn = $("#log-mode-multi-btn");
  const singleCont = $("#log-single-channel-container");
  const multiCont = $("#log-multi-channel-container");

  if (mode === "multi") {
    if (multiBtn) {
      multiBtn.className = "px-3 py-1.5 rounded text-xs font-semibold transition bg-[#FFE000] text-[#141414] shadow-sm flex items-center gap-1.5";
    }
    if (singleBtn) {
      singleBtn.className = "px-3 py-1.5 rounded text-xs font-semibold transition text-zinc-400 hover:text-[#F1F1F1] flex items-center gap-1.5";
    }
    if (singleCont) singleCont.classList.add("hidden");
    if (multiCont) multiCont.classList.remove("hidden");
  } else {
    if (singleBtn) {
      singleBtn.className = "px-3 py-1.5 rounded text-xs font-semibold transition bg-[#FFE000] text-[#141414] shadow-sm flex items-center gap-1.5";
    }
    if (multiBtn) {
      multiBtn.className = "px-3 py-1.5 rounded text-xs font-semibold transition text-zinc-400 hover:text-[#F1F1F1] flex items-center gap-1.5";
    }
    if (singleCont) singleCont.classList.remove("hidden");
    if (multiCont) multiCont.classList.add("hidden");
  }

  if (doMarkDirty) markDirty();
  updateAuditLogBadges();
}

function renderIgnoredChannelsList() {
  const container = $("#log-ignored-channels-list");
  if (!container) return;

  const s = state.settings;
  const ignored = s?.logging?.filters?.ignoredChannels || [];

  if (ignored.length === 0) {
    container.innerHTML = '<span class="text-xs text-zinc-500 italic p-1">Henüz muaf kanal eklenmedi.</span>';
    return;
  }

  container.innerHTML = "";
  for (const chId of ignored) {
    const chObj = state.channels.find((c) => c.id === chId);
    const chName = chObj ? chObj.name : `Kanal ${chId}`;

    const tag = document.createElement("span");
    tag.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1c1c1c] border border-[#262626] text-xs font-semibold text-[#F1F1F1]";
    tag.innerHTML = `
      <i class="fa-solid fa-hashtag text-zinc-500 text-[10px]"></i>
      <span class="truncate max-w-[140px]">${escapeHtml(chName)}</span>
      <button type="button" class="text-zinc-400 hover:text-red-400 ml-1 transition" title="Kaldır">
        <i class="fa-solid fa-xmark text-[11px]"></i>
      </button>
    `;

    const removeBtn = tag.querySelector("button");
    removeBtn.onclick = () => {
      const idx = s.logging.filters.ignoredChannels.indexOf(chId);
      if (idx !== -1) {
        s.logging.filters.ignoredChannels.splice(idx, 1);
        renderIgnoredChannelsList();
        markDirty();
        toast(`#${chName} kanalı muafiyetten çıkarıldı.`);
      }
    };

    container.appendChild(tag);
  }
}

// Canlı Panel Günlüğü (Web Log Explorer)
let logSearchTimer = null;
async function loadLogs() {
  const tbody = $("#log-table-body");
  const countBadge = $("#log-table-count-badge");
  if (!tbody) return;

  const search = $("#log-search-input")?.value?.trim() || "";
  const category = $("#log-category-filter")?.value || "all";
  const eventType = $("#log-type-filter")?.value || "all";
  const guildId = state.selectedGuildId || "";

  try {
    const params = new URLSearchParams();
    if (guildId) params.set("guildId", guildId);
    if (search) params.set("search", search);
    if (category && category !== "all") params.set("category", category);
    if (eventType && eventType !== "all") params.set("eventType", eventType);

    const res = await api(`/api/logs?${params.toString()}`);
    const data = await res.json();
    const logs = data.logs || [];

    if (countBadge) {
      countBadge.textContent = `${logs.length} kayıt`;
    }

    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-zinc-500 text-xs">
            <i class="fa-solid fa-inbox text-2xl block mb-2 text-zinc-600"></i>
            Kriterlere uygun veya henüz kaydedilmiş denetim kaydı bulunamadı.
          </td>
        </tr>
      `;
      return;
    }

    const eventBadgeMap = {
      messageDelete: { label: "Mesaj Silindi", icon: "trash-can", color: "text-red-400 bg-red-500/10 border-red-500/30" },
      messageUpdate: { label: "Mesaj Düzenlendi", icon: "pen-to-square", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
      memberJoin: { label: "Üye Katıldı", icon: "user-plus", color: "text-green-400 bg-green-500/10 border-green-500/30" },
      memberLeave: { label: "Üye Ayrıldı", icon: "user-minus", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
      memberUpdate: { label: "Rol / Profil", icon: "id-badge", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
      voiceJoinLeave: { label: "Ses Odası", icon: "headphones", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
      voiceMuteDeafen: { label: "Ses Susturma", icon: "microphone-slash", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
      guildBan: { label: "Yasaklama (Ban)", icon: "gavel", color: "text-red-500 bg-red-600/15 border-red-500/30" },
    };

    tbody.innerHTML = logs.map((log) => {
      const date = new Date(log.timestamp);
      const timeStr = !isNaN(date.getTime())
        ? date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "—";

      const badgeInfo = eventBadgeMap[log.eventType] || {
        label: log.eventType || "Olay",
        icon: "circle-info",
        color: "text-zinc-300 bg-zinc-800 border-zinc-700",
      };

      const userTag = log.user?.tag || (log.user?.id ? `ID: ${log.user.id}` : "Bilinmiyor");
      const userAvatar = log.user?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
      const channelName = log.channel?.name ? `#${log.channel.name}` : log.channel?.id ? `Kanal: ${log.channel.id}` : "—";

      return `
        <tr class="hover:bg-[#181818] transition">
          <td class="py-2.5 px-3.5 text-zinc-400 text-[11px] whitespace-nowrap font-medium">
            <i class="fa-regular fa-clock mr-1 text-zinc-500"></i>${timeStr}
          </td>
          <td class="py-2.5 px-3.5 whitespace-nowrap">
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeInfo.color}">
              <i class="fa-solid fa-${badgeInfo.icon} text-[10px]"></i>
              ${badgeInfo.label}
            </span>
          </td>
          <td class="py-2.5 px-3.5">
            <div class="flex items-center gap-2 max-w-[180px]">
              <img src="${userAvatar}" class="w-5 h-5 rounded-full bg-zinc-800 border border-[#262626] shrink-0 object-cover" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
              <span class="truncate font-medium text-xs text-[#F1F1F1]" title="${escapeHtml(userTag)}">${escapeHtml(userTag)}</span>
            </div>
          </td>
          <td class="py-2.5 px-3.5 text-zinc-400 text-xs whitespace-nowrap">
            <span class="truncate max-w-[120px] block" title="${escapeHtml(channelName)}">${escapeHtml(channelName)}</span>
          </td>
          <td class="py-2.5 px-3.5 text-xs text-zinc-300">
            <div class="font-medium text-[#F1F1F1] truncate max-w-md">${escapeHtml(log.title)}</div>
            <div class="text-[11px] text-zinc-400 truncate max-w-md mt-0.5">${escapeHtml(log.description || "")}</div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-6 text-center text-red-400 text-xs">
          <i class="fa-solid fa-triangle-exclamation mr-1"></i> Loglar yüklenirken hata oluştu: ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
}

// Denetim kaydı interaktif kontrollerini bağla (Mod, filtreler, arama, butonlar)
function initAuditLogControls() {
  $("#log-mode-single-btn")?.addEventListener("click", () => setLogRoutingMode("single"));
  $("#log-mode-multi-btn")?.addEventListener("click", () => setLogRoutingMode("multi"));

  const setAllEvents = (val) => {
    const ev = state.settings?.logging?.events;
    if (!ev) return;
    const keys = ["messageDelete", "messageUpdate", "memberJoin", "memberLeave", "memberUpdate", "voiceJoinLeave", "voiceMuteDeafen", "guildBan"];
    for (const k of keys) {
      ev[k] = val;
      const chk = $(`#log-event-${k}`);
      if (chk) chk.checked = val;
    }
    markDirty();
    updateAuditLogBadges();
  };
  $("#log-events-select-all")?.addEventListener("click", () => setAllEvents(true));
  $("#log-events-deselect-all")?.addEventListener("click", () => setAllEvents(false));

  const addIgnoredChBtn = $("#log-filter-add-channel-btn");
  if (addIgnoredChBtn) {
    addIgnoredChBtn.onclick = () => {
      const select = $("#log-filter-channel-select");
      const chId = select?.value;
      if (!chId) {
        toast("Lütfen listeye eklenecek bir kanal seçin.", "error");
        return;
      }
      const s = state.settings;
      if (!s.logging.filters) s.logging.filters = { ignoreBots: true, ignoredChannels: [] };
      if (!s.logging.filters.ignoredChannels.includes(chId)) {
        s.logging.filters.ignoredChannels.push(chId);
        renderIgnoredChannelsList();
        markDirty();
        const chObj = state.channels.find((c) => c.id === chId);
        toast(`#${chObj ? chObj.name : chId} kanalı muafiyet listesine eklendi.`);
      } else {
        toast("Bu kanal zaten muafiyet listesinde.", "error");
      }
    };
  }

  const colorResetBtn = $("#log-appearance-color-reset");
  if (colorResetBtn) {
    colorResetBtn.onclick = () => {
      const col = "#FFE000";
      if (state.settings?.logging?.appearance) {
        state.settings.logging.appearance.embedColor = col;
      }
      const cInput = $("#log-appearance-color");
      const cHex = $("#log-appearance-color-hex");
      if (cInput) cInput.value = col;
      if (cHex) cHex.value = col;
      markDirty();
      toast("Embed vurgu rengi varsayılana (#FFE000) sıfırlandı.");
    };
  }

  const testLogBtn = $("#log-test-send-btn");
  if (testLogBtn) {
    testLogBtn.onclick = async () => {
      if (!state.selectedGuildId) {
        toast("Sunucu seçilmedi!", "error");
        return;
      }
      try {
        testLogBtn.disabled = true;
        testLogBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Gönderiliyor...';
        await api(`/api/logs/test?guildId=${encodeURIComponent(state.selectedGuildId)}`, { method: "POST" });
        toast("Test denetim kaydı Discord'a ve canlı tabloya gönderildi!");
        await loadLogs();
      } catch (err) {
        toast(`Test logu gönderilemedi: ${err.message}`, "error");
      } finally {
        testLogBtn.disabled = false;
        testLogBtn.innerHTML = '<i class="fa-solid fa-vial text-[#FFE000]"></i> Test Log Gönder';
      }
    };
  }

  const clearLogBtn = $("#log-clear-btn");
  if (clearLogBtn) {
    clearLogBtn.onclick = async () => {
      if (!confirm("Kayıtlı tüm denetim loglarını temizlemek istediğinize emin misiniz?")) return;
      try {
        await apiFetch(`/api/logs/clear?guildId=${state.selectedGuildId || ""}`, { method: "POST" });
        toast("Denetim kayıtları temizlendi.");
        loadLogs();
      } catch (err) {
        toast("Kayıtlar temizlenirken hata oluştu.", "error");
      }
    };
  }

  const refreshLogBtn = $("#log-refresh-btn");
  if (refreshLogBtn) {
    refreshLogBtn.onclick = async () => {
      refreshLogBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Yenileniyor';
      await loadLogs();
      setTimeout(() => {
        refreshLogBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Yenile';
      }, 400);
      toast("Denetim kayıtları güncellendi.");
    };
  }

  const searchInput = $("#log-search-input");
  if (searchInput) {
    searchInput.oninput = () => {
      clearTimeout(logSearchTimer);
      logSearchTimer = setTimeout(() => {
        loadLogs();
      }, 250);
    };
  }

  const catFilter = $("#log-category-filter");
  if (catFilter) {
    createCustomSelect(catFilter);
    catFilter.onchange = () => loadLogs();
  }

  const typeFilter = $("#log-type-filter");
  if (typeFilter) {
    createCustomSelect(typeFilter);
    typeFilter.onchange = () => loadLogs();
  }
}

// ---------------- Ana Sayfa Gönderi Akışı (Server Feed) Yönetimi ----------------

function updateFeedBadges() {
  const s = state.settings;
  if (!s || !s.feed) return;

  // 1. Ana Durum Rozeti
  const activeBadge = $("#feed-active-status-badge");
  if (activeBadge) {
    if (s.feed.enabled) {
      activeBadge.textContent = "Aktif";
      activeBadge.className = "text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30";
    } else {
      activeBadge.textContent = "Pasif";
      activeBadge.className = "text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-[#262626]";
    }
  }

  // 2. Hedef Kanal Rozeti
  const targetBadge = $("#badge-feed-target");
  if (targetBadge) {
    const chObj = state.channels.find((c) => c.id === s.feed.targetChannelId);
    if (chObj) {
      targetBadge.textContent = `#${chObj.name}`;
      targetBadge.className = "text-xs font-bold text-[#FFE000]";
    } else if (s.feed.targetChannelId) {
      targetBadge.textContent = `ID: ${s.feed.targetChannelId}`;
      targetBadge.className = "text-xs font-bold text-[#FFE000]";
    } else {
      targetBadge.textContent = "Seçilmedi";
      targetBadge.className = "text-xs font-bold text-amber-400";
    }
  }

  // 3. İzlenen Kanallar Rozeti
  const sourcesBadge = $("#badge-feed-sources");
  if (sourcesBadge) {
    const count = s.feed.sourceChannelIds?.length || 0;
    sourcesBadge.textContent = `${count} Kanal İzleniyor`;
    sourcesBadge.className = `text-xs font-bold ${count > 0 ? "text-zinc-300" : "text-amber-400"}`;
  }

  // 4. Önizleme Uzunluğu Rozeti
  const lenBadge = $("#badge-feed-length");
  if (lenBadge) {
    lenBadge.textContent = `${s.feed.previewLength || 200} Karakter`;
  }

  // 5. Bot Filtresi Rozeti
  const botBadge = $("#badge-feed-bot-filter");
  if (botBadge) {
    const ignore = s.feed.ignoreBots !== false;
    botBadge.textContent = ignore ? "Botlar Yoksayılıyor" : "Botlar Dahil Ediliyor";
    botBadge.className = `text-xs font-bold ${ignore ? "text-green-400" : "text-amber-400"}`;
  }
}

function updateFeedPreview() {
  const s = state.settings;
  if (!s || !s.feed) return;

  // 1. Kenarlık Rengi
  const card = $("#feed-preview-card");
  if (card) {
    card.style.borderColor = s.feed.embedColor || "#FFE000";
  }

  // 2. Başlık
  const firstSourceId = s.feed.sourceChannelIds?.[0];
  const foundCh = firstSourceId ? state.channels.find((c) => c.id === firstSourceId) : null;
  const isForum = Boolean(foundCh?.isForum);

  const titleEl = $("#feed-prev-title");
  if (titleEl) {
    titleEl.textContent = isForum
      ? "Örnek 3D Model Tasarımı"
      : (foundCh ? `📌 #${foundCh.name}` : "Örnek Gönderi Başlığı");
  }

  // 3. Açıklama Metni Kırpması
  const descEl = $("#feed-prev-desc");
  if (descEl) {
    const sample = "Sunucumuzun yeni güncellemesi ve duyuruları yayınlandı! Tüm detayları incelemek, kaynak dosyaları indirmek ve tartışmaya katılmak için aşağıdaki butona tıklayarak orijinal mesaja doğrudan ulaşabilirsiniz.";
    const maxLen = Math.max(20, Math.min(1000, Number(s.feed.previewLength) || 200));
    descEl.textContent = sample.length > maxLen ? sample.slice(0, maxLen).trim() + "…" : sample;
  }

  // 4. Görsel Alanı
  const imgWrap = $("#feed-prev-img-wrap");
  if (imgWrap) {
    imgWrap.classList.toggle("hidden", s.feed.includeImages === false);
  }
}

function renderFeedSourceChannels() {
  const container = $("#feed-source-channels-list");
  if (!container) return;

  const s = state.settings;
  const sources = s?.feed?.sourceChannelIds || [];

  if (sources.length === 0) {
    container.innerHTML = '<span class="text-xs text-zinc-500 italic p-1">Henüz izlenen kanal eklenmedi. Yukarıdan kanal seçip "Kanalı Ekle" butonuna basın.</span>';
    return;
  }

  container.innerHTML = "";
  for (const chId of sources) {
    const chObj = state.channels.find((c) => c.id === chId);
    const chName = chObj ? chObj.name : `Kanal ${chId}`;
    const isForum = Boolean(chObj?.isForum);
    const iconClass = isForum ? "fa-comments" : "fa-hashtag";

    const tag = document.createElement("span");
    tag.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1c1c1c] border border-[#262626] text-xs font-semibold text-[#F1F1F1] group";
    tag.innerHTML = `
      <i class="fa-solid ${iconClass} text-[#FFE000] text-[10px]"></i>
      <span class="truncate max-w-[150px]">${escapeHtml(chName)}</span>
      ${isForum ? '<span class="text-[9px] text-[#FFE000] bg-[#FFE000]/15 px-1.5 py-0.5 rounded font-bold border border-[#FFE000]/30">Forum</span>' : ''}
      <button type="button" class="text-zinc-400 hover:text-red-400 ml-1 transition" title="Kaldır">
        <i class="fa-solid fa-xmark text-[11px]"></i>
      </button>
    `;

    const removeBtn = tag.querySelector("button");
    removeBtn.onclick = () => {
      const idx = s.feed.sourceChannelIds.indexOf(chId);
      if (idx !== -1) {
        s.feed.sourceChannelIds.splice(idx, 1);
        renderFeedSourceChannels();
        markDirty();
        updateFeedBadges();
        updateFeedPreview();
        toast(`#${chName} kanalı izleme listesinden çıkarıldı.`);
      }
    };

    container.appendChild(tag);
  }
}

function initFeedControls() {
  const addSourceBtn = $("#feed-add-source-btn");
  if (addSourceBtn) {
    addSourceBtn.onclick = () => {
      const select = $("#feed-source-channel-select");
      const chId = select?.value;
      if (!chId) {
        toast("Lütfen listeye eklenecek bir kanal seçin.", "error");
        return;
      }
      const s = state.settings;
      if (!s.feed) s.feed = { sourceChannelIds: [] };
      if (!Array.isArray(s.feed.sourceChannelIds)) s.feed.sourceChannelIds = [];

      if (chId === s.feed.targetChannelId) {
        toast("Ana sayfa akışının hedef kanalı, izlenen kaynak kanal olarak seçilemez!", "error");
        return;
      }

      if (s.feed.sourceChannelIds.includes(chId)) {
        toast("Bu kanal zaten izlenenler listesinde ekli.", "error");
        return;
      }

      s.feed.sourceChannelIds.push(chId);

      // Kanal eklendiğinde modülü otomatik aktif duruma getir
      if (!s.feed.enabled) {
        s.feed.enabled = true;
        const enSwitch = $("#feed-enabled");
        if (enSwitch) enSwitch.checked = true;
      }

      renderFeedSourceChannels();
      markDirty();
      updateFeedBadges();
      updateFeedPreview();
      const chObj = state.channels.find((c) => c.id === chId);
      toast(`${chObj?.isForum ? "💬" : "#"} ${chObj ? chObj.name : chId} kanalı izleme listesine eklendi.`);
    };
  }

  // Doğrudan Kaydet butonu
  const directSaveBtn = $("#feed-save-direct-btn");
  if (directSaveBtn) {
    directSaveBtn.onclick = () => save();
  }

  const testFeedBtn = $("#feed-test-btn");
  if (testFeedBtn) {
    testFeedBtn.onclick = async () => {
      if (!state.selectedGuildId) {
        toast("Sunucu seçilmedi!", "error");
        return;
      }
      const origHtml = testFeedBtn.innerHTML;
      testFeedBtn.disabled = true;
      testFeedBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Gönderiliyor...';
      try {
        await api(`/api/feed/test?guildId=${encodeURIComponent(state.selectedGuildId)}`, { method: "POST" });
        toast("Test gönderi kartı Discord ana sayfa kanalına iletildi!");
        loadDashboardStats();
      } catch (err) {
        toast(`Test gönderilemedi: ${err.message}`, "error");
      } finally {
        testFeedBtn.disabled = false;
        testFeedBtn.innerHTML = origHtml;
      }
    };
  }

  const feedColorReset = $("#feed-embed-color-reset");
  if (feedColorReset) {
    feedColorReset.onclick = () => {
      const col = "#FFE000";
      if (state.settings?.feed) {
        state.settings.feed.embedColor = col;
      }
      const cInput = $("#feed-embed-color");
      const cHex = $("#feed-embed-color-hex");
      if (cInput) cInput.value = col;
      if (cHex) cHex.value = col;
      markDirty();
      updateFeedPreview();
      toast("Vurgu rengi varsayılana (#FFE000) sıfırlandı.");
    };
  }

}

// ---------------- Sekmeler & Butonlar ----------------

for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    $("#tab-dashboard")?.classList.toggle("hidden", btn.dataset.tab !== "dashboard");
    $("#tab-general")?.classList.toggle("hidden", btn.dataset.tab !== "general");
    $("#tab-welcome")?.classList.toggle("hidden", btn.dataset.tab !== "welcome");
    $("#tab-messages")?.classList.toggle("hidden", btn.dataset.tab !== "messages");
    $("#tab-feed")?.classList.toggle("hidden", btn.dataset.tab !== "feed");
    $("#page-title").textContent = btn.dataset.title || btn.textContent.trim();
    
    // Açık dropdownları kapat
    document.querySelectorAll(".custom-select-wrapper.open").forEach((w) => w.classList.remove("open"));

    // Dashboard ve Mesaj Gönder sekmelerinde ana genel Kaydet butonuna gerek yok
    const isSaveTab = btn.dataset.tab === "general" || btn.dataset.tab === "welcome" || btn.dataset.tab === "feed";
    const saveBtn = $("#save-btn");
    const saveStatus = $("#save-status");
    if (saveBtn) saveBtn.classList.toggle("hidden", !isSaveTab);
    if (saveStatus) saveStatus.classList.toggle("hidden", !isSaveTab);

    if (btn.dataset.tab === "welcome") {
      renderLayerList();
      renderProps();
      draw();
    }
    if (btn.dataset.tab === "feed") {
      updateFeedBadges();
      updateFeedPreview();
    }
    if (btn.dataset.tab === "dashboard") loadDashboardStats();
    if (btn.dataset.tab === "general") loadLogs();
  };
}

async function save() {
  if (!state.selectedGuildId) {
    toast("Sunucu seçilmedi!", "error");
    return false;
  }
  try {
    const res = await api(`/api/settings?guildId=${encodeURIComponent(state.selectedGuildId)}`, {
      method: "PUT",
      body: JSON.stringify(state.settings),
    });
    state.settings = await res.json();
    state.dirty = false;
    setSaveStatus(`${icon("check", "mr-1")} Kaydedildi`, "text-green-400");
    bindForms();
    renderLayerList();
    renderProps();
    draw();
    return true;
  } catch (err) {
    toast(`Kaydedilemedi: ${err.message}`, "error");
    return false;
  }
}

$("#save-btn").onclick = save;
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
});

$("#server-preview-btn").onclick = async () => {
  try {
    const res = await api(`/api/preview?guildId=${encodeURIComponent(state.selectedGuildId || "")}`, {
      method: "POST",
      body: JSON.stringify({ card: card() }),
    });
    const blob = await res.blob();
    $("#preview-img").src = URL.createObjectURL(blob);
    $("#preview-modal").classList.remove("hidden");
  } catch (err) {
    toast(err.message, "error");
  }
};
$("#preview-close").onclick = () => $("#preview-modal").classList.add("hidden");
$("#preview-modal").onclick = (e) => { if (e.target.id === "preview-modal") $("#preview-modal").classList.add("hidden"); };

$("#test-btn").onclick = async () => {
  if (state.dirty && !(await save())) return;
  try {
    await api(`/api/welcome/test?guildId=${encodeURIComponent(state.selectedGuildId || "")}`, { method: "POST" });
    toast("Test kartı karşılama kanalına gönderildi!");
  } catch (err) {
    toast(err.message, "error");
  }
};

// ---------------- Mesaj & Duyuru Gönderme ----------------

const msgFormatRadios = document.querySelectorAll('input[name="msg-format"]');
const msgTextGroup = $("#msg-text-group");
const msgEmbedGroup = $("#msg-embed-group");
const msgEmbedTitle = $("#msg-embed-title");
const msgEmbedColor = $("#msg-embed-color");
const msgEmbedColorText = $("#msg-embed-color-text");
const msgEmbedDesc = $("#msg-embed-desc");
const embedPreviewBox = $("#embed-preview-box");
const embedPreviewTitle = $("#embed-preview-title");
const embedPreviewDesc = $("#embed-preview-desc");
const sendMsgBtn = $("#send-msg-btn");
const msgStatus = $("#msg-status");

// Format değişimi (Düz mesaj / Embed)
for (const radio of msgFormatRadios) {
  radio.onchange = () => {
    const isEmbed = radio.value === "embed";
    msgTextGroup.classList.toggle("hidden", isEmbed);
    msgEmbedGroup.classList.toggle("hidden", !isEmbed);
  };
}

// Renk seçici senkronizasyonu
if (msgEmbedColor && msgEmbedColorText) {
  const embedColorSwatch = $("#embed-color-swatch");
  msgEmbedColor.oninput = () => {
    msgEmbedColorText.value = msgEmbedColor.value.toUpperCase();
    if (embedColorSwatch) embedColorSwatch.style.backgroundColor = msgEmbedColor.value;
    if (embedPreviewBox) embedPreviewBox.style.borderColor = msgEmbedColor.value;
  };
  msgEmbedColorText.oninput = () => {
    let val = msgEmbedColorText.value.trim();
    if (!val.startsWith("#")) val = "#" + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      msgEmbedColor.value = val;
      if (embedColorSwatch) embedColorSwatch.style.backgroundColor = val;
      if (embedPreviewBox) embedPreviewBox.style.borderColor = val;
    }
  };
}

// Canlı Embed kutusu önizleme
function updateEmbedPreview() {
  if (embedPreviewTitle) {
    embedPreviewTitle.textContent = msgEmbedTitle.value.trim() || "Duyuru Başlığı";
  }
  if (embedPreviewDesc) {
    embedPreviewDesc.textContent = msgEmbedDesc.value.trim() || "Duyuru detayları burada görünecek...";
  }
}

if (msgEmbedTitle) msgEmbedTitle.oninput = updateEmbedPreview;
if (msgEmbedDesc) msgEmbedDesc.oninput = updateEmbedPreview;

// Mesajı sunucuya ilet
if (sendMsgBtn) {
  sendMsgBtn.onclick = async () => {
    const channelId = $("#msg-target-channel")?.value;
    if (!channelId) {
      toast("Lütfen mesajın gönderileceği bir kanal seçin.", "error");
      return;
    }

    const format = document.querySelector('input[name="msg-format"]:checked')?.value || "text";
    const isEmbed = format === "embed";
    const content = $("#msg-content")?.value;
    const title = msgEmbedTitle?.value;
    const color = msgEmbedColor?.value || "#FFE000";
    const desc = msgEmbedDesc?.value;

    if (!isEmbed && (!content || !content.trim())) {
      toast("Lütfen göndermek istediğiniz mesajı yazın.", "error");
      return;
    }

    if (isEmbed && (!title?.trim() && !desc?.trim())) {
      toast("Lütfen duyuru için başlık veya açıklama metni girin.", "error");
      return;
    }

    sendMsgBtn.disabled = true;
    sendMsgBtn.innerHTML = `${icon("spinner", "fa-spin mr-1")} Gönderiliyor...`;
    if (msgStatus) msgStatus.textContent = "Gönderiliyor...";

    try {
      const res = await api("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          channelId,
          content,
          isEmbed,
          embedTitle: title,
          embedColor: color,
          embedDescription: desc,
        }),
      });
      const data = await res.json();
      toast(`Mesaj #${data.channelName || "kanala"} başarıyla gönderildi!`);
      if (msgStatus) msgStatus.innerHTML = `<span class="text-green-400 font-semibold">${icon("check", "mr-1")} Başarıyla gönderildi</span>`;

      // Başarılı olunca metin kutularını sıfırla
      if (!isEmbed) {
        $("#msg-content").value = "";
      } else {
        msgEmbedTitle.value = "";
        msgEmbedDesc.value = "";
        updateEmbedPreview();
      }
    } catch (err) {
      toast(`Gönderilemedi: ${err.message}`, "error");
      if (msgStatus) msgStatus.innerHTML = `<span class="text-red-400 font-semibold">${icon("circle-xmark", "mr-1")} Hata: ${escapeHtml(err.message)}</span>`;
    } finally {
      sendMsgBtn.disabled = false;
      sendMsgBtn.innerHTML = `${icon("paper-plane", "mr-1")} Gönder`;
      setTimeout(() => { if (msgStatus) msgStatus.textContent = ""; }, 4000);
    }
  };
}

// ---------------- Kenar Çubuğu Aç/Kapat ----------------
const sidebar = $("#sidebar");
const sidebarToggleBtn = $("#sidebar-toggle");

function setSidebarCollapsed(collapsed) {
  sidebar.classList.toggle("collapsed", collapsed);
  localStorage.setItem("sidebar_collapsed", collapsed ? "true" : "false");
}

if (sidebarToggleBtn) {
  sidebarToggleBtn.onclick = () => {
    setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
  };
}

if (localStorage.getItem("sidebar_collapsed") === "true") {
  setSidebarCollapsed(true);
}

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) e.preventDefault();
});

// ---------------- Dashboard İstatistikleri ----------------
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}g ${h}s ${m}d`;
  if (h > 0) return `${h}s ${m}d`;
  if (m > 0) return `${m}d ${s}sn`;
  return `${s}sn`;
}

function formatRelativeTime(date) {
  if (!date || isNaN(date.getTime())) return "";
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Az önce";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} sa önce`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} gün önce`;
  return date.toLocaleDateString("tr-TR");
}

async function loadDashboardStats() {
  try {
    const res = await api(`/api/stats?guildId=${encodeURIComponent(state.selectedGuildId || "")}`);
    const data = await res.json();

    // Sunucu bilgileri
    if (data.guild) {
      const g = data.guild;
      const iconImg = $("#dash-guild-icon");
      if (iconImg) {
        iconImg.src = g.icon || "https://cdn.discordapp.com/embed/avatars/0.png";
      }
      const nameEl = $("#dash-guild-name");
      if (nameEl) nameEl.textContent = g.name;

      const idText = $("#dash-guild-id-text");
      if (idText) idText.textContent = g.id;

      // Sayaçlar
      const membersEl = $("#stat-members");
      if (membersEl) membersEl.textContent = g.memberCount.toLocaleString();

      const textChannelsEl = $("#stat-text-channels");
      if (textChannelsEl) textChannelsEl.textContent = g.textChannelsCount;

      const voiceChannelsEl = $("#stat-voice-channels");
      if (voiceChannelsEl) voiceChannelsEl.textContent = g.voiceChannelsCount;

      const rolesEl = $("#stat-roles");
      if (rolesEl) rolesEl.textContent = g.rolesCount;

      // 1. Üye Dağılımı (İnsan vs Bot)
      const humansCountEl = $("#stat-humans-count");
      const botsCountEl = $("#stat-bots-count");
      const humansBar = $("#stat-humans-bar");
      const botsBar = $("#stat-bots-bar");
      const humansPctEl = $("#stat-humans-pct");
      const botsPctEl = $("#stat-bots-pct");
      const ratioBadge = $("#stat-ratio-badge");

      const totalMembers = g.memberCount || 1;
      const humans = g.humanCount ?? Math.max(0, g.memberCount - (g.botCount || 0));
      const bots = g.botCount ?? 0;
      const humanPct = Math.min(100, Math.max(0, Math.round((humans / totalMembers) * 100)));
      const botPct = 100 - humanPct;

      if (humansCountEl) humansCountEl.textContent = humans.toLocaleString();
      if (botsCountEl) botsCountEl.textContent = bots.toLocaleString();
      if (humansBar) humansBar.style.width = `${humanPct}%`;
      if (botsBar) botsBar.style.width = `${botPct}%`;
      if (humansPctEl) humansPctEl.textContent = `%${humanPct} Gerçek`;
      if (botsPctEl) botsPctEl.textContent = `%${botPct} Bot`;
      if (ratioBadge) ratioBadge.textContent = `%${humanPct} İnsan / %${botPct} Bot`;

      // 2. Nitro Boost
      const boostBadge = $("#dash-boost-badge");
      const boostCountEl = $("#dash-boost-count");
      const boostBar = $("#dash-boost-bar");
      const boostPctEl = $("#dash-boost-pct");
      const boostTargetText = $("#dash-boost-target-text");

      const boostTier = g.boostTier || 0;
      const boostCount = g.boostCount || 0;
      const target = g.nextTierTarget || 2;
      const boostPct = Math.min(100, Math.round((boostCount / target) * 100));

      if (boostBadge) boostBadge.textContent = `Seviye ${boostTier}`;
      if (boostCountEl) boostCountEl.textContent = `${boostCount} Boost`;
      if (boostBar) boostBar.style.width = `${boostPct}%`;
      if (boostPctEl) boostPctEl.textContent = `%${boostPct}`;
      if (boostTargetText) {
        if (boostTier >= 3) {
          boostTargetText.textContent = "Maksimum Boost Seviyesi!";
        } else {
          const remaining = Math.max(0, target - boostCount);
          boostTargetText.textContent = `Seviye ${boostTier + 1} için ${remaining} boost kaldı`;
        }
      }

      // 3. Sunucu Kurucusu & Tarihçe
      const ownerAvatar = $("#dash-owner-avatar");
      const ownerName = $("#dash-owner-name");
      const guildAge = $("#dash-guild-age");

      if (ownerAvatar && g.owner?.avatarUrl) ownerAvatar.src = g.owner.avatarUrl;
      if (ownerName) ownerName.textContent = g.owner ? (g.owner.tag || g.owner.username) : "Sunucu Kurucusu";
      if (guildAge && g.createdAt) {
        const createdDate = new Date(g.createdAt);
        const diffDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        const dateStr = createdDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
        guildAge.textContent = `${diffDays.toLocaleString()} gündür aktif • ${dateStr}`;
      }

      // 4. Güvenlik Seviyesi
      const secVerify = $("#dash-sec-verify");
      const secFilter = $("#dash-sec-filter");
      const verifyMap = ["Yok (Açık)", "Düşük (E-posta)", "Orta (5 dk kayıtlı)", "Yüksek (10 dk sunucuda)", "En Yüksek (Telefon)"];
      const filterMap = ["Devre Dışı", "Rolü Olmayanlar", "Tüm Üyeler Taranır"];

      if (secVerify) secVerify.textContent = verifyMap[g.verificationLevel] || "Standart";
      if (secFilter) secFilter.textContent = filterMap[g.explicitContentFilter] || "Aktif";

      // 5. Son Katılan Üyeler
      const recentContainer = $("#dash-recent-members");
      if (recentContainer) {
        if (!g.recentMembers || g.recentMembers.length === 0) {
          recentContainer.innerHTML = `<div class="col-span-full text-xs text-zinc-500 p-3 text-center bg-[#141414] rounded-lg border border-[#262626]">Kayıtlı yeni üye bulunmuyor.</div>`;
        } else {
          recentContainer.innerHTML = g.recentMembers.map((m) => {
            const timeText = m.joinedAt ? formatRelativeTime(new Date(m.joinedAt)) : "";
            return `
              <div class="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#141414] border border-[#262626] hover:border-[#FFE000]/40 transition group">
                <img src="${m.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png"}" class="w-8 h-8 rounded-full border border-[#262626] shrink-0 object-cover" alt="" />
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-semibold text-[#F1F1F1] group-hover:text-[#FFE000] transition truncate">${m.displayName || m.username}</div>
                  <div class="text-[10px] text-zinc-500 truncate">${timeText}</div>
                </div>
              </div>
            `;
          }).join("");
        }
      }

      // Modül durumları
      const logStatusBadge = $("#dash-log-status-badge");
      const logChannelName = $("#dash-log-channel-name");
      if (logStatusBadge) {
        if (g.loggingEnabled) {
          logStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-[#FFE000]/15 text-[#FFE000] border border-[#FFE000]/40";
          logStatusBadge.textContent = "Aktif";
        } else {
          logStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-500 border border-[#262626]";
          logStatusBadge.textContent = "Pasif";
        }
      }
      if (logChannelName) {
        const found = state.channels.find((c) => c.id === g.loggingChannelId);
        logChannelName.textContent = found ? `Kanal: #${found.name}` : (g.loggingChannelId ? `Kanal ID: ${g.loggingChannelId}` : "Kanal: Seçilmedi");
      }

      const welcomeStatusBadge = $("#dash-welcome-status-badge");
      const welcomeChannelName = $("#dash-welcome-channel-name");
      if (welcomeStatusBadge) {
        if (g.welcomeEnabled) {
          welcomeStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-[#FFE000]/15 text-[#FFE000] border border-[#FFE000]/40";
          welcomeStatusBadge.textContent = "Aktif";
        } else {
          welcomeStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-500 border border-[#262626]";
          welcomeStatusBadge.textContent = "Pasif";
        }
      }
      if (welcomeChannelName) {
        const found = state.channels.find((c) => c.id === g.welcomeChannelId);
        welcomeChannelName.textContent = found ? `Kanal: #${found.name}` : (g.welcomeChannelId ? `Kanal ID: ${g.welcomeChannelId}` : "Kanal: Seçilmedi");
      }

      const feedStatusBadge = $("#dash-feed-status-badge");
      const feedChannelName = $("#dash-feed-channel-name");
      if (feedStatusBadge) {
        if (g.feedEnabled) {
          feedStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-[#FFE000]/15 text-[#FFE000] border border-[#FFE000]/40";
          feedStatusBadge.textContent = "Aktif";
        } else {
          feedStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-500 border border-[#262626]";
          feedStatusBadge.textContent = "Pasif";
        }
      }
      if (feedChannelName) {
        const found = state.channels.find((c) => c.id === g.feedTargetChannelId);
        feedChannelName.textContent = found ? `Hedef Kanal: #${found.name}` : (g.feedTargetChannelId ? `Kanal ID: ${g.feedTargetChannelId}` : "Hedef Kanal: Seçilmedi");
      }
    }

    // 6. Canlı Akış & Son Hareketler
    const actContainer = $("#dash-activity-list");
    if (actContainer) {
      if (!data.activities || data.activities.length === 0) {
        actContainer.innerHTML = `<div class="text-xs text-zinc-500 p-3 text-center bg-[#141414] rounded-lg border border-[#262626]">Henüz kayıtlı hareket bulunmuyor.</div>`;
      } else {
        actContainer.innerHTML = data.activities.slice(0, 6).map((a) => {
          const timeText = a.time ? formatRelativeTime(new Date(a.time)) : "";
          return `
            <div class="flex items-center justify-between p-2.5 rounded-lg bg-[#141414] border border-[#262626] hover:border-[#333333] transition">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0" style="background-color: ${a.color}15; color: ${a.color}; border: 1px solid ${a.color}35;">
                  <i class="fa-solid fa-${a.icon || "bolt"}"></i>
                </div>
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-[#F1F1F1] truncate">${a.title}</div>
                  <div class="text-[11px] text-zinc-400 truncate">${a.desc}</div>
                </div>
              </div>
              <span class="text-[10px] text-zinc-500 shrink-0 ml-2">${timeText}</span>
            </div>
          `;
        }).join("");
      }
    }

    // 7. Bot sistem bilgileri & Donanım
    if (data.bot) {
      const b = data.bot;
      const pingEl = $("#bot-ping");
      if (pingEl) pingEl.textContent = `${b.ping} ms`;

      const pingDot = $("#bot-ping-dot");
      if (pingDot) {
        if (b.ping < 80) pingDot.className = "w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]";
        else if (b.ping < 180) pingDot.className = "w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.7)]";
        else pingDot.className = "w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]";
      }

      const memEl = $("#bot-memory");
      if (memEl) memEl.textContent = `${b.memoryMB} MB`;

      const guildsEl = $("#bot-total-guilds");
      if (guildsEl) guildsEl.textContent = b.totalGuilds;

      const uptimeEl = $("#bot-uptime");
      if (uptimeEl) uptimeEl.textContent = formatUptime(b.uptimeSeconds);

      const nodeVer = $("#bot-node-ver");
      if (nodeVer) nodeVer.textContent = `Node: ${b.nodeVersion || "v22.x"}`;

      const djsVer = $("#bot-djs-ver");
      if (djsVer) djsVer.textContent = `discord.js: v${b.djsVersion || "14.17"}`;

      const platformEl = $("#bot-platform");
      if (platformEl) platformEl.textContent = b.platform || "Windows";
    }
  } catch (err) {
    console.error("Dashboard istatistikleri yüklenemedi:", err);
  }
}

// Hızlı Eylemler (Quick Actions) Olay Dinleyicileri
const qaSendMsg = $("#qa-send-msg");
if (qaSendMsg) {
  qaSendMsg.onclick = () => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="messages"]');
    if (tabBtn) tabBtn.click();
  };
}

const qaEditWelcome = $("#qa-edit-welcome");
if (qaEditWelcome) {
  qaEditWelcome.onclick = () => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="welcome"]');
    if (tabBtn) tabBtn.click();
  };
}

const qaTestWelcome = $("#qa-test-welcome");
if (qaTestWelcome) {
  qaTestWelcome.onclick = async () => {
    try {
      await api(`/api/welcome/test?guildId=${encodeURIComponent(state.selectedGuildId || "")}`, { method: "POST" });
      toast("Test kartı karşılama kanalına gönderildi!");
      loadDashboardStats();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

const copyGuildIdAction = () => {
  if (!state.selectedGuildId) return;
  navigator.clipboard.writeText(state.selectedGuildId);
  toast("Sunucu ID panoya kopyalandı!");
  const qaTitle = $("#qa-copy-id-title");
  if (qaTitle) {
    qaTitle.textContent = "Kopyalandı!";
    setTimeout(() => { qaTitle.textContent = "ID Kopyala"; }, 2000);
  }
};

const qaCopyId = $("#qa-copy-id");
if (qaCopyId) qaCopyId.onclick = copyGuildIdAction;

const dashCopyIdBanner = $("#dash-copy-id-banner");
if (dashCopyIdBanner) dashCopyIdBanner.onclick = copyGuildIdAction;

const dashRefreshBtn = $("#dash-refresh-btn");
if (dashRefreshBtn) {
  dashRefreshBtn.onclick = () => {
    loadDashboardStats();
    toast("İstatistikler güncellendi.");
  };
}

// Dashboard Modül Kartlarına Tıklandığında İlgili Sekmeye Geçiş
const dashLogCard = $("#dash-log-module-card");
if (dashLogCard) {
  dashLogCard.onclick = () => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="general"]');
    if (tabBtn) tabBtn.click();
  };
}

const dashWelcomeCard = $("#dash-welcome-module-card");
if (dashWelcomeCard) {
  dashWelcomeCard.onclick = () => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="welcome"]');
    if (tabBtn) tabBtn.click();
  };
}

const dashFeedCard = $("#dash-feed-module-card");
if (dashFeedCard) {
  dashFeedCard.onclick = () => {
    const tabBtn = document.querySelector('.tab-btn[data-tab="feed"]');
    if (tabBtn) tabBtn.click();
  };
}

// ---------------- Sunucu Değiştirme ----------------
async function switchGuild(guildId) {
  if (state.dirty) {
    if (!confirm("Kaydedilmemiş değişiklikler var. Sunucu değiştirmek istediğinize emin misiniz?")) {
      $("#guild-selector").value = state.selectedGuildId;
      return;
    }
  }
  state.selectedGuildId = guildId;
  localStorage.setItem("selected_guild_id", guildId);

  const [settings, bot] = await Promise.all([
    api(`/api/settings?guildId=${encodeURIComponent(guildId)}`).then((r) => r.json()),
    api(`/api/bot?guildId=${encodeURIComponent(guildId)}`).then((r) => r.json()),
  ]);

  state.settings = settings;
  state.bot = bot;
  state.dirty = false;
  setSaveStatus("", "");

  const selectedGuild = state.guilds.find((g) => g.id === guildId);
  const serverLabel = $("#bot-server");
  if (serverLabel) serverLabel.textContent = selectedGuild ? selectedGuild.name : bot.serverName || "Discord Bot";
  if (guildSelector) createCustomSelect(guildSelector);

  fillChannelSelects();
  bindForms();
  renderLayerList();
  renderProps();
  draw();
  loadDashboardStats();
  if (!$("#tab-general")?.classList.contains("hidden")) loadLogs();
}

const guildSelector = $("#guild-selector");
if (guildSelector) {
  guildSelector.onchange = () => {
    switchGuild(guildSelector.value);
  };
}

// ---------------- Başlangıç ----------------

async function init() {
  try {
    const [guilds, channels] = await Promise.all([
      api("/api/guilds").then((r) => r.json()),
      api("/api/channels").then((r) => r.json()),
    ]);
    state.guilds = guilds;
    state.channels = channels;

    // Sunucu seçici dropdown'ını doldur
    if (guildSelector) {
      guildSelector.innerHTML = "";
      if (guilds.length === 0) {
        guildSelector.add(new Option("Sunucu bulunamadı", ""));
      } else {
        for (const g of guilds) {
          guildSelector.appendChild(new Option(`${g.name} (${g.memberCount} üye)`, g.id));
        }
      }
    }

    // Önceden seçilmiş sunucu veya ilk sunucu
    const savedGuildId = localStorage.getItem("selected_guild_id");
    const activeGuildId = guilds.some((g) => g.id === savedGuildId) ? savedGuildId : (guilds[0]?.id || "");
    state.selectedGuildId = activeGuildId;
    if (guildSelector) {
      guildSelector.value = activeGuildId;
      createCustomSelect(guildSelector);
    }

    const [settings, bot] = await Promise.all([
      api(`/api/settings?guildId=${encodeURIComponent(activeGuildId)}`).then((r) => r.json()),
      api(`/api/bot?guildId=${encodeURIComponent(activeGuildId)}`).then((r) => r.json()),
    ]);
    state.settings = settings;
    state.bot = bot;

    $("#bot-name").textContent = bot.username;
    $("#bot-avatar").src = bot.avatarUrl;
    const serverLabel = $("#bot-server");
    const currentGuild = guilds.find((g) => g.id === activeGuildId);
    if (serverLabel) serverLabel.textContent = currentGuild ? currentGuild.name : bot.serverName || "Discord Bot";

    const badge = $("#bot-status-badge");
    if (badge) {
      if (bot.ready) {
        badge.className = "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1c1c1c] bg-[#23a55a] shadow-sm cursor-help";
        badge.title = "Çevrimiçi (Discord'a bağlı)";
      } else {
        badge.className = "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1c1c1c] bg-[#f23f43] shadow-sm cursor-help";
        badge.title = "Bağlı Değil";
      }
    }

    // Başlangıçta dashboard sayfası aktif olduğundan save butonunu gizle
    const saveBtn = $("#save-btn");
    const saveStatus = $("#save-status");
    if (saveBtn) saveBtn.classList.add("hidden");
    if (saveStatus) saveStatus.classList.add("hidden");

    fillChannelSelects();
    bindForms();
    initAuditLogControls();
    initFeedControls();
    renderLayerList();
    renderProps();
    draw();
    loadDashboardStats();
  } catch (err) {
    toast(`Panel yüklenemedi: ${err.message}`, "error");
  }
}

init();
