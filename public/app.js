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
  members: [],
  memberRoles: [],
  memberStats: null,
  membersLoading: false,
  membersFilters: {
    search: "",
    type: "all",
    roleId: "all",
    status: "all",
    joinDate: "all",
    age: "all",
    sortBy: "joined_desc",
    page: 1,
    perPage: 50,
    viewMode: "table",
  },
  selectedMember: null,
  steamGame: null,
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

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== "string") return `rgba(255, 255, 255, ${alpha})`;
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(255, 255, 255, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateLogBadgeColors(eventType, color) {
  if (!eventType || !color) return;
  const bg = hexToRgba(color, 0.12);
  const border = hexToRgba(color, 0.3);
  document.querySelectorAll(`.log-event-badge[data-event-type="${eventType}"]`).forEach((badge) => {
    badge.style.color = color;
    badge.style.backgroundColor = bg;
    badge.style.borderColor = border;
  });
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
function createCustomSelect(selectEl) {
  if (!selectEl) return null;

  let wrapper = selectEl.closest(".dropdown, .custom-select-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "dropdown custom-select-wrapper";
    if (selectEl.classList.contains("flex-1")) {
      wrapper.classList.add("flex-1", "min-w-0");
    }
    if (selectEl.classList.contains("dropdown-sm") || selectEl.classList.contains("custom-select-sm") || selectEl.classList.contains("text-xs") || selectEl.id === "members-per-page") {
      wrapper.classList.add("dropdown-sm", "custom-select-sm");
    }
    if (selectEl.classList.contains("w-auto") || selectEl.id === "members-per-page") {
      wrapper.style.width = "auto";
      wrapper.style.minWidth = "85px";
    }
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    selectEl.style.display = "none";
  }

  if (!selectEl._customSelectBound) {
    selectEl._customSelectBound = true;
    selectEl.addEventListener("change", () => syncCustomSelect(selectEl));
  }

  // Önceki trigger ve menu varsa temizle
  const oldTrigger = wrapper.querySelector(".dropdown-trigger, .custom-select-trigger");
  if (oldTrigger) oldTrigger.remove();
  const oldMenu = wrapper.querySelector(".dropdown-menu, .custom-select-menu");
  if (oldMenu) oldMenu.remove();

  const trigger = document.createElement("div");
  trigger.className = "dropdown-trigger custom-select-trigger";
  trigger.setAttribute("role", "button");
  trigger.setAttribute("tabindex", "0");

  const triggerContent = document.createElement("div");
  triggerContent.className = "flex items-center min-w-0 mr-2 pointer-events-none flex-1";

  const triggerIcon = document.createElement("i");
  triggerIcon.className = "mr-2 text-xs shrink-0 hidden";

  const triggerDot = document.createElement("span");
  triggerDot.className = "w-2 h-2 rounded-full mr-2 shrink-0 hidden";

  const triggerText = document.createElement("span");
  triggerText.className = "truncate pointer-events-none";

  triggerContent.append(triggerIcon, triggerDot, triggerText);

  // Mevcut seçili metni ve ikonu bul
  let selectedOpt = selectEl.options[0] || null;
  for (let i = 0; i < selectEl.options.length; i++) {
    const o = selectEl.options[i];
    if (o.value === selectEl.value || (selectEl.selectedIndex === i && !selectEl.value && !o.value)) {
      selectedOpt = o;
      break;
    }
  }

  if (selectedOpt) {
    triggerText.textContent = selectedOpt.text;
    if (selectedOpt.dataset.icon) {
      triggerIcon.className = `${selectedOpt.dataset.icon} w-4 text-center mr-2 text-xs text-[#FFE000] shrink-0`;
      triggerDot.className = "hidden";
    } else if (selectedOpt.dataset.color) {
      triggerDot.className = "w-2 h-2 rounded-full mr-2 shrink-0";
      triggerDot.style.backgroundColor = selectedOpt.dataset.color;
      triggerIcon.className = "hidden";
    } else {
      triggerIcon.className = "hidden";
      triggerDot.className = "hidden";
    }
    if (selectEl.dataset.type === "font" && selectedOpt.value) {
      triggerText.style.fontFamily = `"${selectedOpt.value}", Arial, sans-serif`;
    }
  } else {
    triggerText.textContent = "Seçin...";
  }

  const arrow = document.createElement("i");
  arrow.className = "fa-solid fa-chevron-down arrow-icon pointer-events-none ml-auto shrink-0";

  trigger.append(triggerContent, arrow);

  const menu = document.createElement("div");
  menu.className = "dropdown-menu custom-select-menu";

  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    const isSelected = opt.value === selectEl.value || (!selectEl.value && !opt.value && i === 0);

    const item = document.createElement("div");
    item.className = `dropdown-option custom-select-option ${isSelected ? "selected" : ""}`;
    item.dataset.value = opt.value;

    const optContent = document.createElement("div");
    optContent.className = "flex items-center min-w-0 pointer-events-none flex-1";

    if (opt.dataset.icon) {
      const optIcon = document.createElement("i");
      optIcon.className = `${opt.dataset.icon} w-4 text-center mr-2 text-xs shrink-0 ${isSelected ? "text-[#FFE000]" : "text-zinc-400"}`;
      optContent.appendChild(optIcon);
    } else if (opt.dataset.color) {
      const optDot = document.createElement("span");
      optDot.className = "w-2 h-2 rounded-full mr-2 shrink-0";
      optDot.style.backgroundColor = opt.dataset.color;
      optContent.appendChild(optDot);
    }

    const labelSpan = document.createElement("span");
    labelSpan.className = "truncate pointer-events-none";
    labelSpan.textContent = opt.text;
    if (selectEl.dataset.type === "font" && opt.value) {
      labelSpan.style.fontFamily = `"${opt.value}", Arial, sans-serif`;
    }
    optContent.appendChild(labelSpan);
    item.appendChild(optContent);

    if (isSelected) {
      const check = document.createElement("i");
      check.className = "fa-solid fa-check text-xs ml-2 text-[#FFE000] pointer-events-none shrink-0";
      item.appendChild(check);
    }

    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      selectEl.value = opt.value;
      triggerText.textContent = opt.text;

      if (opt.dataset.icon) {
        triggerIcon.className = `${opt.dataset.icon} w-4 text-center mr-2 text-xs text-[#FFE000] shrink-0`;
        triggerDot.className = "hidden";
      } else if (opt.dataset.color) {
        triggerDot.className = "w-2 h-2 rounded-full mr-2 shrink-0";
        triggerDot.style.backgroundColor = opt.dataset.color;
        triggerIcon.className = "hidden";
      } else {
        triggerIcon.className = "hidden";
        triggerDot.className = "hidden";
      }

      if (selectEl.dataset.type === "font" && opt.value) {
        triggerText.style.fontFamily = `"${opt.value}", Arial, sans-serif`;
      }

      menu.querySelectorAll(".dropdown-option, .custom-select-option").forEach((o) => {
        o.classList.remove("selected");
        const ch = o.querySelector(".fa-check");
        if (ch) ch.remove();
        const ic = o.querySelector("i:not(.fa-check)");
        if (ic && o.dataset.value !== opt.value) ic.classList.replace("text-[#FFE000]", "text-zinc-400");
      });
      item.classList.add("selected");
      const activeIcon = item.querySelector("i:not(.fa-check)");
      if (activeIcon) activeIcon.classList.replace("text-zinc-400", "text-[#FFE000]");

      const check = document.createElement("i");
      check.className = "fa-solid fa-check text-xs ml-2 text-[#FFE000] pointer-events-none shrink-0";
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
    document.querySelectorAll(".dropdown.open, .custom-select-wrapper.open").forEach((w) => {
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
  document.querySelectorAll(".dropdown.open, .custom-select-wrapper.open").forEach((w) => {
    w.classList.remove("open");
  });
});

/**
 * Programatik olarak değeri değiştirilen select öğesinin özel dropdown arayüzünü günceller.
 */
function syncCustomSelect(selectEl) {
  if (!selectEl) return;
  const wrapper = selectEl.closest(".dropdown, .custom-select-wrapper");
  if (!wrapper) return;
  const triggerText = wrapper.querySelector(".dropdown-trigger span.truncate, .custom-select-trigger span.truncate");
  const triggerIcon = wrapper.querySelector(".dropdown-trigger i:not(.arrow-icon), .custom-select-trigger i:not(.arrow-icon)");
  const triggerDot = wrapper.querySelector(".dropdown-trigger span.rounded-full, .custom-select-trigger span.rounded-full");
  const menu = wrapper.querySelector(".dropdown-menu, .custom-select-menu");
  if (!triggerText || !menu) return;

  let selectedOpt = selectEl.options[0] || null;
  for (let i = 0; i < selectEl.options.length; i++) {
    const o = selectEl.options[i];
    if (o.value === selectEl.value || (selectEl.selectedIndex === i && !selectEl.value && !o.value)) {
      selectedOpt = o;
      break;
    }
  }

  if (selectedOpt) {
    triggerText.textContent = selectedOpt.text;
    if (triggerIcon) {
      if (selectedOpt.dataset.icon) {
        triggerIcon.className = `${selectedOpt.dataset.icon} w-4 text-center mr-2 text-xs text-[#FFE000] shrink-0`;
      } else {
        triggerIcon.className = "hidden";
      }
    }
    if (triggerDot) {
      if (selectedOpt.dataset.color) {
        triggerDot.className = "w-2 h-2 rounded-full mr-2 shrink-0";
        triggerDot.style.backgroundColor = selectedOpt.dataset.color;
      } else {
        triggerDot.className = "hidden";
      }
    }
    if (selectEl.dataset.type === "font" && selectedOpt.value) {
      triggerText.style.fontFamily = `"${selectedOpt.value}", Arial, sans-serif`;
    }
  } else {
    triggerText.textContent = "Seçin...";
    if (triggerIcon) triggerIcon.className = "hidden";
    if (triggerDot) triggerDot.className = "hidden";
  }

  menu.querySelectorAll(".dropdown-option, .custom-select-option").forEach((optEl) => {
    const isSelected = optEl.dataset.value === selectEl.value;
    optEl.classList.toggle("selected", isSelected);
    const ch = optEl.querySelector(".fa-check");
    if (isSelected) {
      if (!ch) {
        const check = document.createElement("i");
        check.className = "fa-solid fa-check text-xs ml-2 text-[#FFE000] pointer-events-none shrink-0";
        optEl.appendChild(check);
      }
      const ic = optEl.querySelector("i:not(.fa-check)");
      if (ic) ic.classList.replace("text-zinc-400", "text-[#FFE000]");
    } else {
      if (ch) ch.remove();
      const ic = optEl.querySelector("i:not(.fa-check)");
      if (ic) ic.classList.replace("text-[#FFE000]", "text-zinc-400");
    }
  });
}

/**
 * Sayfadaki tüm select öğelerini veya belirtilen konteyner içindekileri özel dropdown'a dönüştürür.
 */
function initAllCustomSelects(root = document) {
  root.querySelectorAll("select").forEach((sel) => {
    if (!sel.closest(".custom-select-wrapper")) {
      createCustomSelect(sel);
    }
  });
}


function applyPlaceholders(text) {
  const b = state.bot || {};
  return text
    .replaceAll("{username}", b.username || "Kullanıcı")
    .replaceAll("{displayName}", b.displayName || "Kullanıcı")
    .replaceAll("{server}", b.serverName || "Sunucu")
    .replaceAll("{memberCount}", String(b.memberCount ?? 100));
}

// Görsel önbelleği: yüklenince tuvali yeniden çizer (sınırsız büyümesin diye en fazla 20 görsel)
const IMAGE_CACHE_MAX = 20;
const imageCache = new Map();
function getImage(src) {
  if (!src) return null;
  if (!imageCache.has(src)) {
    if (imageCache.size >= IMAGE_CACHE_MAX) {
      imageCache.delete(imageCache.keys().next().value);
    }
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
    { id: "background", label: `${icon("image")} Arka Plan` },
    { id: "avatar", label: `${icon("user")} Profil Fotoğrafı` },
    ...card().texts.map((t) => ({ id: t.id, label: `${icon("font")} ${escapeHtml(t.text || "(boş metin)")}` })),
  ];
  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = `tab-btn layer-btn ${state.selected === item.id ? "active" : ""}`;
    btn.innerHTML = item.label;
    btn.onclick = () => selectLayer(item.id);
    list.appendChild(btn);
  }
  updateWelcomeBadges();
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
    hexInput.className = "flex-1 min-w-0 bg-transparent text-[#F1F1F1] text-xs font-semibold uppercase tracking-wider outline-none pt-0.5";
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
      eyedropperBtn.className = "btn btn-sm shrink-0";
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

function button(label, onClick, cls = "btn w-full") {
  const b = document.createElement("button");
  b.className = `${cls} col-span-2`;
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
        ...(bg.imageUrl ? [button(`${icon("trash-can")} Görseli Kaldır`, () => { bg.imageUrl = ""; markDirty(); renderProps(); draw(); }, "btn btn-danger w-full")] : []),
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
      }, "btn btn-danger w-full")
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

      const suffix = ch.isForum ? " (Forum)" : "";
      const opt = new Option(`${ch.isForum ? "" : "# "}${ch.name}${suffix}`, ch.id);
      opt.dataset.icon = ch.isForum ? "fa-solid fa-comments" : "fa-solid fa-hashtag";
      select.appendChild(opt);
    }
    select.value = currentVal;
    createCustomSelect(select);
  }
}

const LOG_DEFAULT_EVENT_COLORS = {
  messageDelete: "#EF4444",
  messageUpdate: "#F59E0B",
  memberJoin: "#10B981",
  memberLeave: "#F43F5E",
  memberUpdate: "#38BDF8",
  voiceJoinLeave: "#A855F7",
  voiceMuteDeafen: "#F97316",
  guildBan: "#DC2626",
};

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
      eventColors: { ...LOG_DEFAULT_EVENT_COLORS },
    };
  }
  if (!s.logging.appearance.eventColors) {
    s.logging.appearance.eventColors = { ...LOG_DEFAULT_EVENT_COLORS };
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
      updateWelcomeBadges();
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
    // bindForms birden çok kez çağrıldığı için önceki dinleyiciyi kaldır (birikme/sızıntı önlenir)
    if (mainLogCh._syncDefaultChannel) {
      mainLogCh.removeEventListener("change", mainLogCh._syncDefaultChannel);
    }
    mainLogCh._syncDefaultChannel = () => {
      s.logging.channels.default = mainLogCh.value;
    };
    mainLogCh.addEventListener("change", mainLogCh._syncDefaultChannel);
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

  // Olay Filtresi Embed Renkleri (Her filtre için bağımsız renk ayarı)
  for (const [key, defColor] of Object.entries(LOG_DEFAULT_EVENT_COLORS)) {
    const swatch = $(`#log-color-${key}`);
    const hex = $(`#log-color-${key}-hex`);
    const val = s.logging.appearance.eventColors[key] || defColor;
    if (swatch) swatch.value = val;
    if (hex) hex.value = val;

    if (swatch && hex) {
      swatch.oninput = () => {
        hex.value = swatch.value;
        s.logging.appearance.eventColors[key] = swatch.value;
        markDirty();
        updateLogBadgeColors(key, swatch.value);
      };
      hex.oninput = () => {
        let textVal = hex.value.trim();
        if (!textVal.startsWith("#") && textVal.length > 0) textVal = "#" + textVal;
        if (/^#[0-9A-Fa-f]{6}$/.test(textVal)) {
          swatch.value = textVal;
          s.logging.appearance.eventColors[key] = textVal;
          markDirty();
          updateLogBadgeColors(key, textVal);
        }
      };
    }
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
  updateWelcomeBadges();

  // 8. Steam Güncelleme Takibi Ayarları
  if (!s.steam) {
    s.steam = {
      enabled: false,
      appId: "",
      channelId: "",
      mentionRoleId: "",
      checkIntervalMinutes: 10,
      embedColor: "#1b2838",
      lastGid: "",
    };
  }
  if (typeof s.steam.checkIntervalMinutes !== "number") s.steam.checkIntervalMinutes = 10;
  if (!s.steam.embedColor) s.steam.embedColor = "#1b2838";

  bind("#steam-enabled", s.steam, "enabled", "checked");
  bind("#steam-app-id-input", s.steam, "appId");
  bind("#steam-channel-select", s.steam, "channelId");
  bind("#steam-role-select", s.steam, "mentionRoleId");
  bind("#steam-interval-select", s.steam, "checkIntervalMinutes");

  const steamColorInput = $("#steam-embed-color");
  const steamColorHex = $("#steam-embed-color-hex");
  if (steamColorInput && steamColorHex) {
    steamColorInput.value = s.steam.embedColor;
    steamColorHex.value = s.steam.embedColor;
    steamColorInput.oninput = () => {
      steamColorHex.value = steamColorInput.value;
      s.steam.embedColor = steamColorInput.value;
      markDirty();
      updateSteamPreview();
    };
    steamColorHex.oninput = () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(steamColorHex.value)) {
        steamColorInput.value = steamColorHex.value;
        s.steam.embedColor = steamColorHex.value;
        markDirty();
        updateSteamPreview();
      }
    };
  }

  fillSteamRoleSelect();
  updateSteamBadges();
  updateSteamPreview();
  if (s.steam.appId) {
    checkSteamApp(s.steam.appId, true);
  }
}

// ---------------- Denetim Kaydı (Audit Log) Yönetimi ----------------

function updateAuditLogBadges() {
  const s = state.settings;
  if (!s || !s.logging) return;

  // Ana Durum
  const activeBadge = $("#log-active-status-badge");
  if (activeBadge) {
    activeBadge.textContent = s.logging.enabled ? "Aktif" : "Pasif";
    activeBadge.className = `module-badge ${s.logging.enabled ? "active" : "passive"}`;
  }

  // Mod
  const modeBadge = $("#badge-log-mode");
  if (modeBadge) {
    modeBadge.textContent = s.logging.channels?.mode === "multi" ? "Ayrı Kanallar (4 Kategori)" : "Tek Kanal";
    modeBadge.className = "summary-tile-value val-primary";
  }

  // Olaylar
  const eventsBadge = $("#badge-log-events");
  if (eventsBadge) {
    const ev = s.logging.events || {};
    const keys = ["messageDelete", "messageUpdate", "memberJoin", "memberLeave", "memberUpdate", "voiceJoinLeave", "voiceMuteDeafen", "guildBan"];
    const activeCount = keys.filter((k) => ev[k] !== false).length;
    eventsBadge.textContent = `${activeCount}/8 Olay Açık`;
    eventsBadge.className = `summary-tile-value ${activeCount > 0 ? "val-neutral" : "val-warning"}`;
  }

  // Bot Koruması
  const botBadge = $("#badge-log-bot-filter");
  if (botBadge) {
    const ignore = s.logging.filters?.ignoreBots !== false;
    botBadge.textContent = ignore ? "Botlar Yoksayılıyor" : "Botlar Dahil Ediliyor";
    botBadge.className = `summary-tile-value ${ignore ? "val-success" : "val-warning"}`;
  }

  // Görünüm
  const appBadge = $("#badge-log-appearance");
  if (appBadge) {
    const isCompact = s.logging.appearance?.detailLevel === "compact";
    appBadge.textContent = isCompact ? "Kompakt (Sade)" : "Zengin (Detaylı)";
    appBadge.className = "summary-tile-value val-neutral";
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
    if (multiBtn) multiBtn.className = "btn btn-primary btn-sm";
    if (singleBtn) singleBtn.className = "btn btn-sm";
    if (singleCont) singleCont.classList.add("hidden");
    if (multiCont) multiCont.classList.remove("hidden");
  } else {
    if (singleBtn) singleBtn.className = "btn btn-primary btn-sm";
    if (multiBtn) multiBtn.className = "btn btn-sm";
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
    tag.className = "chip-tag";
    tag.innerHTML = `
      <i class="fa-solid fa-hashtag text-zinc-500 text-[10px]"></i>
      <span class="truncate max-w-[140px]">${escapeHtml(chName)}</span>
      <button type="button" class="chip-remove-btn" title="Kaldır">
        <i class="fa-solid fa-xmark"></i>
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
          <td colspan="5" class="p-6">
            <div class="empty-state">
              <div class="empty-state-icon">
                <i class="fa-solid fa-inbox"></i>
              </div>
              <div class="empty-state-title">Kayıt Bulunamadı</div>
              <div class="empty-state-desc">
                Kriterlere uygun veya henüz kaydedilmiş denetim kaydı bulunamadı.
              </div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const eventBadgeMap = {
      messageDelete: { label: "Mesaj Silindi", icon: "trash-can" },
      messageUpdate: { label: "Mesaj Düzenlendi", icon: "pen-to-square" },
      memberJoin: { label: "Üye Katıldı", icon: "user-plus" },
      memberLeave: { label: "Üye Ayrıldı", icon: "user-minus" },
      memberUpdate: { label: "Rol / Profil", icon: "id-badge" },
      voiceJoinLeave: { label: "Ses Odası", icon: "headphones" },
      voiceMuteDeafen: { label: "Ses Susturma", icon: "microphone-slash" },
      guildBan: { label: "Yasaklama (Ban)", icon: "gavel" },
    };

    tbody.innerHTML = logs.map((log) => {
      const date = new Date(log.timestamp);
      const timeStr = !isNaN(date.getTime())
        ? date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "—";

      const badgeInfo = eventBadgeMap[log.eventType] || {
        label: log.eventType || "Olay",
        icon: "circle-info",
      };

      const eventColor =
        state.settings?.logging?.appearance?.eventColors?.[log.eventType] ||
        log.color ||
        LOG_DEFAULT_EVENT_COLORS[log.eventType] ||
        state.settings?.logging?.appearance?.embedColor ||
        "#FFE000";

      const badgeBg = hexToRgba(eventColor, 0.12);
      const badgeBorder = hexToRgba(eventColor, 0.3);

      const userTag = log.user?.tag || (log.user?.id ? `ID: ${log.user.id}` : "Bilinmiyor");
      const userAvatar = log.user?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
      const channelName = log.channel?.name ? `#${log.channel.name}` : log.channel?.id ? `Kanal: ${log.channel.id}` : "—";

      return `
        <tr class="hover:bg-[#181818] transition">
          <td class="py-2.5 px-3.5 text-zinc-400 text-[11px] whitespace-nowrap font-medium">
            <i class="fa-regular fa-clock mr-1 text-zinc-500"></i>${timeStr}
          </td>
          <td class="py-2.5 px-3.5 whitespace-nowrap">
            <span data-event-type="${escapeHtml(log.eventType || "")}" class="badge log-event-badge" style="color: ${escapeHtml(eventColor)}; background-color: ${badgeBg}; border-color: ${badgeBorder};">
              <i class="fa-solid fa-${badgeInfo.icon}"></i>
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

  const eventColorsResetBtn = $("#log-appearance-event-colors-reset");
  if (eventColorsResetBtn) {
    eventColorsResetBtn.onclick = () => {
      const s = state.settings;
      if (!s?.logging?.appearance) return;
      s.logging.appearance.eventColors = { ...LOG_DEFAULT_EVENT_COLORS };
      for (const [key, col] of Object.entries(LOG_DEFAULT_EVENT_COLORS)) {
        const swatch = $(`#log-color-${key}`);
        const hex = $(`#log-color-${key}-hex`);
        if (swatch) swatch.value = col;
        if (hex) hex.value = col;
        updateLogBadgeColors(key, col);
      }
      markDirty();
      toast("Olay embed renkleri varsayılan palete sıfırlandı.");
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
        await api(`/api/logs/clear?guildId=${state.selectedGuildId || ""}`, { method: "POST" });
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
      activeBadge.className = "module-badge active";
    } else {
      activeBadge.textContent = "Pasif";
      activeBadge.className = "module-badge passive";
    }
  }

  // 2. Hedef Kanal Rozeti
  const targetBadge = $("#badge-feed-target");
  if (targetBadge) {
    const chObj = state.channels.find((c) => c.id === s.feed.targetChannelId);
    if (chObj) {
      targetBadge.textContent = `#${chObj.name}`;
      targetBadge.className = "summary-tile-value val-primary";
    } else if (s.feed.targetChannelId) {
      targetBadge.textContent = `ID: ${s.feed.targetChannelId}`;
      targetBadge.className = "summary-tile-value val-primary";
    } else {
      targetBadge.textContent = "Seçilmedi";
      targetBadge.className = "summary-tile-value val-warning";
    }
  }

  // 3. İzlenen Kanallar Rozeti
  const sourcesBadge = $("#badge-feed-sources");
  if (sourcesBadge) {
    const count = s.feed.sourceChannelIds?.length || 0;
    sourcesBadge.textContent = `${count} Kanal İzleniyor`;
    sourcesBadge.className = `summary-tile-value ${count > 0 ? "val-neutral" : "val-warning"}`;
  }

  // 4. Önizleme Uzunluğu Rozeti
  const lenBadge = $("#badge-feed-length");
  if (lenBadge) {
    lenBadge.textContent = `${s.feed.previewLength || 200} Karakter`;
    lenBadge.className = "summary-tile-value val-neutral";
  }

  // 5. Bot Filtresi Rozeti
  const botBadge = $("#badge-feed-bot-filter");
  if (botBadge) {
    const ignore = s.feed.ignoreBots !== false;
    botBadge.textContent = ignore ? "Botlar Yoksayılıyor" : "Botlar Dahil Ediliyor";
    botBadge.className = `summary-tile-value ${ignore ? "val-success" : "val-warning"}`;
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

// ---------------- Karşılama Mesajı & Kartı (Welcome) Yönetimi ----------------

function updateWelcomeBadges() {
  const s = state.settings;
  if (!s || !s.welcome) return;

  // 1. Ana Durum Rozeti
  const activeBadge = $("#welcome-active-status-badge");
  if (activeBadge) {
    if (s.welcome.enabled) {
      activeBadge.textContent = "Aktif";
      activeBadge.className = "module-badge active";
    } else {
      activeBadge.textContent = "Pasif";
      activeBadge.className = "module-badge passive";
    }
  }

  // 2. Hedef Karşılama Kanalı Rozeti
  const channelBadge = $("#badge-welcome-channel");
  if (channelBadge) {
    const chObj = state.channels.find((c) => c.id === s.welcome.channelId);
    if (chObj) {
      channelBadge.textContent = `#${chObj.name}`;
      channelBadge.className = "summary-tile-value val-primary";
    } else if (s.welcome.channelId) {
      channelBadge.textContent = `ID: ${s.welcome.channelId}`;
      channelBadge.className = "summary-tile-value val-primary";
    } else {
      channelBadge.textContent = "Seçilmedi";
      channelBadge.className = "summary-tile-value val-warning";
    }
  }

  // 3. Karşılama Kartı Boyutu
  const cardBadge = $("#badge-welcome-card");
  if (cardBadge) {
    const c = s.welcome.card;
    if (c && c.width && c.height) {
      cardBadge.textContent = `${c.width}x${c.height} px`;
    } else {
      cardBadge.textContent = "Özel Tasarım";
    }
    cardBadge.className = "summary-tile-value val-neutral";
  }

  // 4. Katman Sayısı Rozeti
  const layersBadge = $("#badge-welcome-layers");
  if (layersBadge) {
    const textCount = s.welcome.card?.texts?.length || 0;
    const totalLayers = 2 + textCount;
    layersBadge.textContent = `${totalLayers} Katman (${textCount} Metin)`;
    layersBadge.className = "summary-tile-value val-neutral";
  }

  // 5. Karşılama Mesajı Durumu
  const msgBadge = $("#badge-welcome-msg");
  if (msgBadge) {
    const hasMsg = Boolean(s.welcome.message && s.welcome.message.trim());
    msgBadge.textContent = hasMsg ? "Özel Metin" : "Varsayılan";
    msgBadge.className = `summary-tile-value ${hasMsg ? "val-success" : "val-muted"}`;
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
    tag.className = "chip-tag";
    tag.innerHTML = `
      <i class="fa-solid ${iconClass} text-[#FFE000] text-[10px]"></i>
      <span class="truncate max-w-[150px]">${escapeHtml(chName)}</span>
      ${isForum ? '<span class="text-[9px] text-[#FFE000] bg-[#FFE000]/15 px-1.5 py-0.5 rounded font-bold border border-[#FFE000]/30">Forum</span>' : ''}
      <button type="button" class="chip-remove-btn" title="Kaldır">
        <i class="fa-solid fa-xmark"></i>
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


  const testFeedBtn = $("#feed-test-btn");
  if (testFeedBtn) {
    testFeedBtn.onclick = async () => {
      if (!state.selectedGuildId) {
        toast("Sunucu seçilmedi!", "error");
        return;
      }
      if (!state.settings?.feed?.targetChannelId) {
        toast("Lütfen önce bir hedef akış kanalı seçip kaydedin!", "error");
        return;
      }
      if (state.dirty && !(await save())) return;

      const origHtml = testFeedBtn.innerHTML;
      testFeedBtn.disabled = true;
      testFeedBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Gönderiliyor...';
      try {
        const res = await api(`/api/feed/test?guildId=${encodeURIComponent(state.selectedGuildId)}`, { method: "POST" });
        const data = await res.json();
        toast(`Test gönderi kartı #${data.channelName || "hedef"} kanalına başarıyla iletildi!`);
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

// ---------------- Steam Güncelleme & Yama Notu Takip Yönetimi ----------------

function updateSteamBadges() {
  const s = state.settings;
  if (!s || !s.steam) return;

  // 1. Ana Durum Rozeti
  const activeBadge = $("#steam-active-status-badge");
  if (activeBadge) {
    if (s.steam.enabled) {
      activeBadge.textContent = "Aktif";
      activeBadge.className = "module-badge active";
    } else {
      activeBadge.textContent = "Pasif";
      activeBadge.className = "module-badge passive";
    }
  }

  // 2. Hedef Paylaşım Kanalı Rozeti
  const chBadge = $("#badge-steam-channel");
  if (chBadge) {
    const ch = state.channels.find((c) => c.id === s.steam.channelId);
    if (ch) {
      chBadge.textContent = `#${ch.name}`;
      chBadge.className = "summary-tile-value val-primary";
    } else if (s.steam.channelId) {
      chBadge.textContent = `ID: ${s.steam.channelId}`;
      chBadge.className = "summary-tile-value val-primary";
    } else {
      chBadge.textContent = "Seçilmedi";
      chBadge.className = "summary-tile-value val-warning";
    }
  }

  // 3. Oyun Adı Rozeti
  const gameNameBadge = $("#badge-steam-game-name");
  if (gameNameBadge) {
    const name = state.steamGame?.appDetails?.name;
    gameNameBadge.textContent = name || (s.steam.appId ? `App ${s.steam.appId}` : "Belirtilmedi");
    gameNameBadge.className = `summary-tile-value ${name ? "val-neutral" : "val-muted"}`;
  }

  // 4. App ID Rozeti
  const appIdBadge = $("#badge-steam-app-id");
  if (appIdBadge) {
    appIdBadge.textContent = s.steam.appId ? s.steam.appId : "Belirtilmedi";
    appIdBadge.className = `summary-tile-value ${s.steam.appId ? "val-neutral" : "val-muted"}`;
  }

  // 5. Kontrol Sıklığı Rozeti
  const intervalBadge = $("#badge-steam-interval");
  if (intervalBadge) {
    intervalBadge.textContent = `${s.steam.checkIntervalMinutes || 10} Dakikada Bir`;
    intervalBadge.className = "summary-tile-value val-success";
  }
}

function updateSteamPreview() {
  const s = state.settings;
  if (!s || !s.steam) return;

  const embedBox = $("#steam-preview-embed");
  if (embedBox) {
    embedBox.style.borderLeftColor = s.steam.embedColor || "#1b2838";
  }

  const roleTag = $("#steam-preview-role-tag");
  if (roleTag) {
    const role = s.steam.mentionRoleId;
    if (role === "everyone") {
      roleTag.textContent = "@everyone";
      roleTag.classList.remove("hidden");
    } else if (role === "here") {
      roleTag.textContent = "@here";
      roleTag.classList.remove("hidden");
    } else if (role) {
      const foundRole = state.memberRoles?.find((r) => r.id === role);
      roleTag.textContent = foundRole ? `@${foundRole.name}` : `@Rol`;
      roleTag.classList.remove("hidden");
    } else {
      roleTag.classList.add("hidden");
    }
  }

  const game = state.steamGame;
  const gameNameEl = $("#steam-preview-game-name");
  if (gameNameEl) {
    gameNameEl.textContent = game?.appDetails?.name || "Steam Oyunu";
  }

  const titleEl = $("#steam-preview-title");
  if (titleEl) {
    titleEl.textContent = game?.latestAnnouncement?.title || "v1.2.0 - Büyük Güncelleme & Yama Notları";
  }

  const descEl = $("#steam-preview-desc");
  if (descEl) {
    descEl.textContent = game?.latestAnnouncement?.summary || "**Yeni Özellikler:**\n• Çok oyunculu sunucu optimizasyonları tamamlandı.\n• Yeni harita ve oyun modu eklendi.\n• Performans iyileştirmeleri ve hata düzeltmeleri yapıldı.\n\n*(Yama notlarının tamamı Steam duyurusunda...)*";
  }

  const imgEl = $("#steam-preview-image");
  const imgContainer = $("#steam-preview-image-container");
  if (imgEl) {
    const targetSrc = game?.latestAnnouncement?.imageUrl || game?.appDetails?.headerImage || "";
    if (targetSrc) {
      imgEl.src = targetSrc;
      if (imgContainer) imgContainer.classList.remove("hidden");
    } else {
      if (imgContainer) imgContainer.classList.add("hidden");
    }
  }
}

async function loadGuildRoles(guildId) {
  if (!guildId) return [];
  try {
    const res = await api(`/api/roles?guildId=${encodeURIComponent(guildId)}`);
    const roles = await res.json();
    state.memberRoles = Array.isArray(roles) ? roles : [];
    return state.memberRoles;
  } catch (err) {
    console.warn("[Roles] Rol listesi alınamadı:", err);
    return [];
  }
}

async function fillSteamRoleSelect() {
  const select = $("#steam-role-select");
  if (!select) return;

  if (!Array.isArray(state.memberRoles) || state.memberRoles.length === 0) {
    if (state.selectedGuildId) {
      await loadGuildRoles(state.selectedGuildId);
    }
  }

  const currentVal = state.settings?.steam?.mentionRoleId || select.value || "";
  select.innerHTML = `
    <option value="">Hiçbiri (Rol Etiketleme)</option>
    <option value="everyone" data-icon="fa-solid fa-at">@everyone</option>
    <option value="here" data-icon="fa-solid fa-at">@here</option>
  `;

  if (Array.isArray(state.memberRoles) && state.memberRoles.length > 0) {
    for (const r of state.memberRoles) {
      const opt = new Option(`@${r.name}`, r.id);
      if (r.color && r.color !== "#000000" && r.color !== "#9ca3af") {
        opt.dataset.color = r.color;
      } else {
        opt.dataset.icon = "fa-solid fa-shield";
      }
      select.appendChild(opt);
    }
  }

  select.value = currentVal;
  createCustomSelect(select);
}

async function checkSteamApp(appId, silent = false) {
  const cleanId = String(appId || "").trim();
  const statusEl = $("#steam-app-check-status");
  const cardEl = $("#steam-verified-game-card");
  const iconEl = $("#steam-verified-game-icon");
  const titleEl = $("#steam-verified-game-title");
  const linkEl = $("#steam-verified-game-link");
  const checkBtn = $("#steam-check-app-btn");

  if (!cleanId || !/^\d+$/.test(cleanId)) {
    if (!silent) toast("Lütfen geçerli bir sayısal Steam App ID girin.", "error");
    if (statusEl) statusEl.textContent = "Geçersiz App ID formatı.";
    return false;
  }

  if (checkBtn) {
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Aranıyor...';
  }
  if (statusEl) statusEl.textContent = "Steam Store ve Haber API sorgulanıyor...";

  try {
    const res = await api(`/api/steam/info?appId=${encodeURIComponent(cleanId)}`);
    const data = await res.json();
    state.steamGame = data;

    if (cardEl) cardEl.classList.remove("hidden");
    if (iconEl) iconEl.src = data.appDetails.headerImage;
    if (titleEl) titleEl.textContent = data.appDetails.name;
    if (linkEl) linkEl.href = data.appDetails.storeUrl;
    if (statusEl) {
      statusEl.innerHTML = `<span class="text-green-400"><i class="fa-solid fa-check mr-1"></i> Doğrulandı: <b>${escapeHtml(data.appDetails.name)}</b></span>`;
    }

    updateSteamBadges();
    updateSteamPreview();

    if (!silent) {
      toast(`"${data.appDetails.name}" başarıyla doğrulandı!`);
    }
    return true;
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span class="text-red-400"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Steam bilgisi alınamadı (${escapeHtml(err.message)})</span>`;
    }
    if (!silent) {
      toast(`Steam sorgulama başarısız: ${err.message}`, "error");
    }
    return false;
  } finally {
    if (checkBtn) {
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Doğrula';
    }
  }
}

function initSteamControls() {
  const checkBtn = $("#steam-check-app-btn");
  if (checkBtn) {
    checkBtn.onclick = () => {
      const appId = $("#steam-app-id-input")?.value;
      checkSteamApp(appId, false);
    };
  }

  const appIdInput = $("#steam-app-id-input");
  if (appIdInput) {
    appIdInput.onblur = () => {
      const appId = appIdInput.value.trim();
      if (appId && (!state.steamGame || state.steamGame.appDetails?.appId !== appId)) {
        checkSteamApp(appId, true);
      }
    };
  }

  const testBtn = $("#steam-test-post-btn");
  if (testBtn) {
    testBtn.onclick = async () => {
      if (!state.selectedGuildId) {
        toast("Sunucu seçilmedi!", "error");
        return;
      }
      const s = state.settings?.steam;
      if (!s?.appId) {
        toast("Lütfen önce bir Steam App ID girin!", "error");
        return;
      }
      if (!s?.channelId) {
        toast("Lütfen önce bir hedef paylaşım kanalı seçin!", "error");
        return;
      }

      if (state.dirty && !(await save())) return;

      const origHtml = testBtn.innerHTML;
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Gönderiliyor...';

      try {
        const res = await api(`/api/steam/test?guildId=${encodeURIComponent(state.selectedGuildId)}`, { method: "POST" });
        const data = await res.json();
        toast(data.message || "Test güncelleme duyurusu kanala iletildi!");
        loadDashboardStats();
      } catch (err) {
        toast(`Test gönderilemedi: ${err.message}`, "error");
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = origHtml;
      }
    };
  }

  const resetColorBtn = $("#steam-embed-color-reset");
  if (resetColorBtn) {
    resetColorBtn.onclick = () => {
      const defaultColor = "#1b2838";
      if (state.settings?.steam) {
        state.settings.steam.embedColor = defaultColor;
      }
      const cInput = $("#steam-embed-color");
      const cHex = $("#steam-embed-color-hex");
      if (cInput) cInput.value = defaultColor;
      if (cHex) cHex.value = defaultColor;
      markDirty();
      updateSteamPreview();
      toast("Vurgu rengi varsayılana (#1b2838) sıfırlandı.");
    };
  }

  const roleSelect = $("#steam-role-select");
  if (roleSelect) {
    roleSelect.onchange = () => {
      if (state.settings?.steam) {
        state.settings.steam.mentionRoleId = roleSelect.value;
        markDirty();
        updateSteamPreview();
      }
    };
  }

  const intervalSelect = $("#steam-interval-select");
  if (intervalSelect) {
    intervalSelect.onchange = () => {
      if (state.settings?.steam) {
        state.settings.steam.checkIntervalMinutes = Number(intervalSelect.value) || 10;
        markDirty();
        updateSteamBadges();
      }
    };
  }
}

// ---------------- Sekmeler & Butonlar ----------------

for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    $("#tab-dashboard")?.classList.toggle("hidden", btn.dataset.tab !== "dashboard");
    $("#tab-members")?.classList.toggle("hidden", btn.dataset.tab !== "members");
    $("#tab-general")?.classList.toggle("hidden", btn.dataset.tab !== "general");
    $("#tab-welcome")?.classList.toggle("hidden", btn.dataset.tab !== "welcome");
    $("#tab-messages")?.classList.toggle("hidden", btn.dataset.tab !== "messages");
    $("#tab-feed")?.classList.toggle("hidden", btn.dataset.tab !== "feed");
    $("#tab-steam")?.classList.toggle("hidden", btn.dataset.tab !== "steam");
    $("#page-title").textContent = btn.dataset.title || btn.textContent.trim();
    
    // Açık dropdownları kapat
    document.querySelectorAll(".custom-select-wrapper.open").forEach((w) => w.classList.remove("open"));

    // Sekme değiştiğinde içeriği en üste sar
    $("#main-content")?.scrollTo({ top: 0, behavior: "instant" });

    // Dashboard, Üyeler ve Mesaj Gönder sekmelerinde ana genel Kaydet butonuna gerek yok
    const isSaveTab = btn.dataset.tab === "general" || btn.dataset.tab === "welcome" || btn.dataset.tab === "feed" || btn.dataset.tab === "steam";
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
    if (btn.dataset.tab === "steam") {
      fillSteamRoleSelect();
      updateSteamBadges();
      updateSteamPreview();
    }
    if (btn.dataset.tab === "dashboard") loadDashboardStats();
    if (btn.dataset.tab === "members") loadMembers();
    if (btn.dataset.tab === "general") loadLogs();
  };
}

// Kenar çubuğu daraltma/genişletme butonu
$("#sidebar-toggle")?.addEventListener("click", () => {
  $("#sidebar")?.classList.toggle("collapsed");
});

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
    const previewImg = $("#preview-img");
    if (previewImg.src.startsWith("blob:")) URL.revokeObjectURL(previewImg.src);
    previewImg.src = URL.createObjectURL(blob);
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

      const steamStatusBadge = $("#dash-steam-status-badge");
      const steamChannelName = $("#dash-steam-channel-name");
      if (steamStatusBadge) {
        if (g.steamEnabled) {
          steamStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-[#FFE000]/15 text-[#FFE000] border border-[#FFE000]/40";
          steamStatusBadge.textContent = "Aktif";
        } else {
          steamStatusBadge.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-500 border border-[#262626]";
          steamStatusBadge.textContent = "Pasif";
        }
      }
      if (steamChannelName) {
        const found = state.channels.find((c) => c.id === g.steamChannelId);
        const appInfo = g.steamAppId ? `App ID: ${g.steamAppId}` : "Oyun: Girilmedi";
        steamChannelName.textContent = found ? `${appInfo} • #${found.name}` : `${appInfo} • Kanal: Seçilmedi`;
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
  if (!$("#tab-members")?.classList.contains("hidden")) loadMembers(true);
}

const guildSelector = $("#guild-selector");
if (guildSelector) {
  guildSelector.onchange = () => {
    switchGuild(guildSelector.value);
  };
}

// ---------------- Sunucu Üyeleri & Geniş Filtreleme Modülü ----------------

function formatMemberRelativeTime(timestamp) {
  if (!timestamp) return "Bilinmiyor";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "az önce";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} sa önce`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} gün önce`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} ay önce`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear} yıl önce`;
}

function formatMemberExactDate(isoStringOrTimestamp) {
  if (!isoStringOrTimestamp) return "Bilinmiyor";
  const d = new Date(isoStringOrTimestamp);
  if (isNaN(d.getTime())) return "Bilinmiyor";
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

window.copyTextToClipboard = function(text, successMsg = "Panoya kopyalandı!") {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(successMsg)).catch(() => {
      fallbackCopyText(text, successMsg);
    });
  } else {
    fallbackCopyText(text, successMsg);
  }
};

function fallbackCopyText(text, successMsg) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  toast(successMsg);
}

window.openMemberModalById = function(memberId) {
  const member = state.members.find((m) => m.id === memberId);
  if (member) openMemberModal(member);
};

function openMemberModal(member) {
  state.selectedMember = member;
  const modal = $("#member-detail-modal");
  if (!modal) return;

  // Banner & Renk
  const banner = $("#mdm-banner");
  if (banner) {
    const roleColor = member.highestRole?.color || "#FFE000";
    banner.style.background = `linear-gradient(135deg, #1c1c1c 0%, ${roleColor}25 50%, #141414 100%)`;
    banner.style.borderTop = `4px solid ${roleColor}`;
  }

  // Profil Başlık
  const avatar = $("#mdm-avatar");
  if (avatar) avatar.src = member.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";

  const dName = $("#mdm-display-name");
  if (dName) dName.textContent = member.displayName || member.username;

  const tag = $("#mdm-tag");
  if (tag) tag.textContent = `@${member.username}`;

  const nickWrapper = $("#mdm-nickname-wrapper");
  const nick = $("#mdm-nickname");
  if (nickWrapper && nick) {
    if (member.nickname && member.nickname !== member.displayName) {
      nickWrapper.classList.remove("hidden");
      nick.textContent = member.nickname;
    } else {
      nickWrapper.classList.add("hidden");
    }
  }

  const botBadge = $("#mdm-bot-badge");
  if (botBadge) botBadge.classList.toggle("hidden", !member.isBot);

  const voiceInd = $("#mdm-voice-indicator");
  if (voiceInd) voiceInd.classList.toggle("hidden", !member.inVoice);

  // Rozetler
  const badgesContainer = $("#mdm-status-badges");
  if (badgesContainer) {
    let badgesHtml = "";
    if (member.isBot) {
      badgesHtml += `<span class="badge badge-purple"><i class="fa-solid fa-robot mr-1"></i> Bot</span>`;
    } else {
      badgesHtml += `<span class="badge badge-green"><i class="fa-solid fa-user mr-1"></i> Kullanıcı</span>`;
    }
    if (member.isBoosting) {
      badgesHtml += `<span class="badge badge-pink"><i class="fa-solid fa-bolt mr-1"></i> Takviyeci (Boost)</span>`;
    }
    if (member.isAdmin) {
      badgesHtml += `<span class="badge badge-amber"><i class="fa-solid fa-crown mr-1"></i> Yönetici</span>`;
    }
    if (member.inVoice) {
      badgesHtml += `<span class="badge badge-green"><i class="fa-solid fa-headphones mr-1"></i> Seste: #${escapeHtml(member.voiceChannelName || "Ses")}</span>`;
    }
    if (member.isTimedOut) {
      badgesHtml += `<span class="badge badge-red"><i class="fa-solid fa-hourglass-half mr-1"></i> Zamanaşımı (Cezalı)</span>`;
    }
    if (member.pending) {
      badgesHtml += `<span class="badge badge-yellow"><i class="fa-solid fa-clipboard-check mr-1"></i> Kuralları Onaylamadı</span>`;
    }
    badgesContainer.innerHTML = badgesHtml;
  }

  // Tarihler
  $("#mdm-joined-full").textContent = formatMemberExactDate(member.joinedTimestamp);
  $("#mdm-joined-rel").textContent = formatMemberRelativeTime(member.joinedTimestamp);
  $("#mdm-created-full").textContent = formatMemberExactDate(member.createdTimestamp);
  $("#mdm-created-rel").textContent = formatMemberRelativeTime(member.createdTimestamp);

  // Roller
  const rolesCount = $("#mdm-roles-count");
  if (rolesCount) rolesCount.textContent = String(member.roles.length);

  const rolesContainer = $("#mdm-roles-container");
  if (rolesContainer) {
    if (member.roles.length === 0) {
      rolesContainer.innerHTML = `<span class="text-zinc-500 text-xs">Bu üyeye atanmış özel rol bulunmuyor.</span>`;
    } else {
      rolesContainer.innerHTML = member.roles
        .map(
          (r) => `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#1a1a1a] border border-[#2b2b2b]" style="color: ${r.color};">
            <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${r.color};"></span>
            ${escapeHtml(r.name)}
          </span>`
        )
        .join("");
    }
  }

  // Yetkiler
  const permsContainer = $("#mdm-permissions-container");
  if (permsContainer) {
    if (!member.permissions || member.permissions.length === 0) {
      permsContainer.innerHTML = `<span class="text-zinc-500 text-xs">Standart üye yetkileri</span>`;
    } else {
      permsContainer.innerHTML = member.permissions
        .map(
          (p) => `
          <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-[#262626] text-[11px] font-medium flex items-center gap-1">
            <i class="fa-solid fa-check text-xs text-[#FFE000]"></i> ${escapeHtml(p)}
          </span>`
        )
        .join("");
    }
  }

  // Yönetim İnputları
  const nickInput = $("#mdm-nickname-input");
  if (nickInput) nickInput.value = member.nickname || "";

  modal.classList.remove("hidden");
}

function closeMemberModal() {
  const modal = $("#member-detail-modal");
  if (modal) modal.classList.add("hidden");
  state.selectedMember = null;
}

async function handleMemberAction(action, payload) {
  if (!state.selectedMember || !state.selectedGuildId) {
    toast("Sunucu veya üye seçili değil!", "error");
    return;
  }
  try {
    const res = await api("/api/members/action", {
      method: "POST",
      body: JSON.stringify({
        guildId: state.selectedGuildId,
        memberId: state.selectedMember.id,
        action,
        ...payload,
      }),
    });
    const data = await res.json();
    toast(data.message || "İşlem başarılı.");
    await loadMembers(true);
    const updated = state.members.find((m) => m.id === state.selectedMember?.id);
    if (updated) openMemberModal(updated);
  } catch (err) {
    toast(err.message || "İşlem başarısız.", "error");
  }
}

function renderMemberRoleBadges(m) {
  if (!m.roles || m.roles.length === 0) {
    return `<span class="text-zinc-500 text-[11px]">Rolsüz</span>`;
  }
  const highest = m.highestRole || m.roles[0];
  const others = m.roles.filter((r) => r.id !== highest.id);

  let html = `
    <div class="flex items-center gap-1 flex-wrap">
      <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#141414] border border-[#262626]" style="color: ${highest.color};">
        <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${highest.color};"></span>
        <span class="truncate max-w-[120px]">${escapeHtml(highest.name)}</span>
      </span>
  `;

  if (others.length > 0) {
    const previewOther = others[0];
    html += `
      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-[#141414] border border-[#262626] text-zinc-400">
        <span class="w-1 h-1 rounded-full shrink-0" style="background-color: ${previewOther.color};"></span>
        <span class="truncate max-w-[90px]">${escapeHtml(previewOther.name)}</span>
      </span>
    `;
  }

  if (others.length > 1) {
    const allRemainingNames = others.slice(1).map((r) => r.name).join(", ");
    html += `
      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-[#262626]" title="${escapeHtml(allRemainingNames)}">
        +${others.length - 1}
      </span>
    `;
  }

  html += `</div>`;
  return html;
}

function renderMemberStatusChips(m, isGrid = false) {
  const chips = [];
  if (m.isBoosting) {
    chips.push(`<span class="badge badge-pink" title="Sunucu Takviyecisi"><i class="fa-solid fa-bolt"></i> Boost</span>`);
  }
  if (m.inVoice) {
    chips.push(`<span class="badge badge-green" title="Seste: ${escapeHtml(m.voiceChannelName || 'Bilinmiyor')}"><i class="fa-solid fa-headphones"></i> Seste</span>`);
  }
  if (m.isAdmin) {
    chips.push(`<span class="badge badge-amber" title="Yönetici"><i class="fa-solid fa-shield-halved"></i> Yetkili</span>`);
  }
  if (m.isTimedOut) {
    chips.push(`<span class="badge badge-red" title="Zamanaşımı / Susturuldu"><i class="fa-solid fa-hourglass-half"></i> Cezalı</span>`);
  }
  const now = Date.now();
  if (m.joinedTimestamp && m.joinedTimestamp >= now - 7 * 24 * 60 * 60 * 1000) {
    chips.push(`<span class="badge badge-blue" title="Son 7 günde katıldı"><i class="fa-solid fa-calendar-plus"></i> Yeni</span>`);
  }
  if (m.createdTimestamp >= now - 30 * 24 * 60 * 60 * 1000) {
    chips.push(`<span class="badge badge-yellow" title="Yeni açılmış Discord hesabı"><i class="fa-solid fa-triangle-exclamation"></i> &lt;30g</span>`);
  }

  if (chips.length === 0) {
    return isGrid ? "" : `<span class="text-zinc-600 text-[10px]">-</span>`;
  }
  return chips.join(" ");
}

function getFilteredMembers() {
  let list = [...(state.members || [])];
  const { search, type, roleId, status, joinDate, age, sortBy } = state.membersFilters;
  const now = Date.now();

  // 1. Arama
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((m) => {
      const u = (m.username || "").toLowerCase();
      const d = (m.displayName || "").toLowerCase();
      const n = (m.nickname || "").toLowerCase();
      const t = (m.tag || "").toLowerCase();
      const id = m.id || "";
      return u.includes(q) || d.includes(q) || n.includes(q) || t.includes(q) || id.includes(q);
    });
  }

  // 2. Hesap Türü
  if (type === "human") {
    list = list.filter((m) => !m.isBot);
  } else if (type === "bot") {
    list = list.filter((m) => m.isBot);
  }

  // 3. Rol
  if (roleId === "no_roles") {
    list = list.filter((m) => !m.roles || m.roles.length === 0);
  } else if (roleId && roleId !== "all") {
    list = list.filter((m) => m.roles && m.roles.some((r) => r.id === roleId));
  }

  // 4. Özel Durum
  if (status === "boosters") {
    list = list.filter((m) => m.isBoosting);
  } else if (status === "voice") {
    list = list.filter((m) => m.inVoice);
  } else if (status === "admin") {
    list = list.filter((m) => m.isAdmin);
  } else if (status === "timedout") {
    list = list.filter((m) => m.isTimedOut);
  } else if (status === "recent24h") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= now - 24 * 60 * 60 * 1000);
  } else if (status === "recent7d") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= now - 7 * 24 * 60 * 60 * 1000);
  } else if (status === "newAccounts") {
    list = list.filter((m) => m.createdTimestamp >= now - 30 * 24 * 60 * 60 * 1000);
  } else if (status === "pending") {
    list = list.filter((m) => m.pending);
  }

  // 5. Katılma Zamanı
  const todayStart = new Date().setHours(0, 0, 0, 0);
  if (joinDate === "today") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= todayStart);
  } else if (joinDate === "3d") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= now - 3 * 24 * 60 * 60 * 1000);
  } else if (joinDate === "7d") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= now - 7 * 24 * 60 * 60 * 1000);
  } else if (joinDate === "30d") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= now - 30 * 24 * 60 * 60 * 1000);
  } else if (joinDate === "90d") {
    list = list.filter((m) => m.joinedTimestamp && m.joinedTimestamp >= now - 90 * 24 * 60 * 60 * 1000);
  }

  // 6. Hesap Yaşı
  const dayMs = 24 * 60 * 60 * 1000;
  if (age === "very_new") {
    list = list.filter((m) => m.createdTimestamp >= now - 7 * dayMs);
  } else if (age === "new") {
    list = list.filter((m) => m.createdTimestamp >= now - 30 * dayMs);
  } else if (age === "medium") {
    list = list.filter((m) => m.createdTimestamp < now - 30 * dayMs && m.createdTimestamp >= now - 180 * dayMs);
  } else if (age === "old") {
    list = list.filter((m) => m.createdTimestamp < now - 365 * dayMs);
  } else if (age === "veteran") {
    list = list.filter((m) => m.createdTimestamp < now - 3 * 365 * dayMs);
  }

  // 7. Sıralama
  list.sort((a, b) => {
    switch (sortBy) {
      case "joined_asc":
        return (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0);
      case "created_desc":
        return b.createdTimestamp - a.createdTimestamp;
      case "created_asc":
        return a.createdTimestamp - b.createdTimestamp;
      case "name_asc":
        return (a.displayName || a.username || "").localeCompare(b.displayName || b.username || "", "tr");
      case "name_desc":
        return (b.displayName || b.username || "").localeCompare(a.displayName || a.username || "", "tr");
      case "role_rank":
        return (b.highestRole?.position || 0) - (a.highestRole?.position || 0);
      case "joined_desc":
      default:
        return (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0);
    }
  });

  return list;
}

function updateActiveFilterChips() {
  const container = $("#members-active-filter-tags-container");
  const chipsEl = $("#members-active-filter-tags");
  if (!container || !chipsEl) return;

  const chips = [];
  const { search, type, roleId, status, joinDate, age } = state.membersFilters;

  if (search) {
    chips.push({
      key: "search",
      label: `Arama: "${escapeHtml(search)}"`,
    });
  }
  if (type !== "all") {
    chips.push({
      key: "type",
      label: `Tür: ${type === "human" ? "Gerçek Kullanıcılar" : "Botlar"}`,
    });
  }
  if (roleId !== "all") {
    if (roleId === "no_roles") {
      chips.push({ key: "roleId", label: "Rol: Rolsüzler" });
    } else {
      const r = state.memberRoles.find((role) => role.id === roleId);
      chips.push({ key: "roleId", label: `Rol: ${escapeHtml(r ? r.name : roleId)}` });
    }
  }
  if (status !== "all") {
    const statusLabels = {
      boosters: "Durum: Takviyeciler",
      voice: "Durum: Seste Olanlar",
      admin: "Durum: Yöneticiler",
      timedout: "Durum: Cezalılar",
      recent24h: "Durum: Son 24 Saat",
      recent7d: "Durum: Son 7 Gün",
      newAccounts: "Durum: Yeni Hesaplar (<30g)",
      pending: "Durum: Kuralları Bekleyenler",
    };
    chips.push({ key: "status", label: statusLabels[status] || status });
  }
  if (joinDate !== "all") {
    const jdLabels = {
      today: "Katılma: Bugün",
      "3d": "Katılma: Son 3 Gün",
      "7d": "Katılma: Son 7 Gün",
      "30d": "Katılma: Son 30 Gün",
      "90d": "Katılma: Son 90 Gün",
    };
    chips.push({ key: "joinDate", label: jdLabels[joinDate] || joinDate });
  }
  if (age !== "all") {
    const ageLabels = {
      very_new: "Hesap: Çok Yeni (<7g)",
      new: "Hesap: Yeni (<30g)",
      medium: "Hesap: Orta (1-6 Ay)",
      old: "Hesap: Kıdemli (>1 Yıl)",
      veteran: "Hesap: Eski (>3 Yıl)",
    };
    chips.push({ key: "age", label: ageLabels[age] || age });
  }

  if (chips.length === 0) {
    container.classList.add("hidden");
    chipsEl.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  chipsEl.innerHTML = chips
    .map(
      (c) => `
      <span class="chip-tag">
        <span>${c.label}</span>
        <button type="button" class="chip-remove-btn" onclick="removeMemberFilter('${c.key}')" title="Filtreyi Kaldır">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </span>`
    )
    .join("");
}

window.removeMemberFilter = function(key) {
  if (key === "search") {
    state.membersFilters.search = "";
    const input = $("#members-search-input");
    if (input) input.value = "";
    $("#members-search-clear")?.classList.add("hidden");
  } else if (key === "type") {
    state.membersFilters.type = "all";
    const select = $("#members-type-filter");
    if (select) { select.value = "all"; syncCustomSelect(select); }
  } else if (key === "roleId") {
    state.membersFilters.roleId = "all";
    const select = $("#members-role-filter");
    if (select) { select.value = "all"; syncCustomSelect(select); }
  } else if (key === "status") {
    state.membersFilters.status = "all";
    const select = $("#members-status-filter");
    if (select) { select.value = "all"; syncCustomSelect(select); }
  } else if (key === "joinDate") {
    state.membersFilters.joinDate = "all";
    const select = $("#members-join-date-filter");
    if (select) { select.value = "all"; syncCustomSelect(select); }
  } else if (key === "age") {
    state.membersFilters.age = "all";
    const select = $("#members-age-filter");
    if (select) { select.value = "all"; syncCustomSelect(select); }
  }
  state.membersFilters.page = 1;
  renderFilteredMembers();
};

function renderFilteredMembers() {
  const filtered = getFilteredMembers();
  updateActiveFilterChips();

  // Rozet sayısı & filtre özeti
  const countBadge = $("#members-count-badge");
  if (countBadge) {
    countBadge.textContent = `${filtered.length} üye bulundu`;
  }

  const summary = $("#members-filter-summary");
  if (summary) {
    const total = state.members ? state.members.length : 0;
    if (filtered.length !== total) {
      summary.textContent = `(Toplam ${total} üye arasından filtrelendi)`;
    } else {
      summary.textContent = `(Toplam ${total} üye)`;
    }
  }

  // KPI kart vurguları
  document.querySelectorAll(".member-filter-card").forEach((card) => {
    card.classList.remove("active");
  });

  const { type, status } = state.membersFilters;
  if (type === "all" && status === "all") {
    $("#filter-card-all")?.classList.add("active");
  } else if (type === "human") {
    $("#filter-card-humans")?.classList.add("active");
  } else if (type === "bot") {
    $("#filter-card-bots")?.classList.add("active");
  } else if (status === "boosters") {
    $("#filter-card-boosters")?.classList.add("active");
  } else if (status === "voice") {
    $("#filter-card-voice")?.classList.add("active");
  } else if (status === "admin") {
    $("#filter-card-admins")?.classList.add("active");
  } else if (status === "timedout") {
    $("#filter-card-timeout")?.classList.add("active");
  } else if (status === "recent7d") {
    $("#filter-card-recent")?.classList.add("active");
  }

  const emptyState = $("#members-empty-state");
  const tableContainer = $("#members-table-container");
  const gridContainer = $("#members-grid-container");
  const paginationContainer = $("#members-pagination-container");

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    if (tableContainer) tableContainer.classList.add("hidden");
    if (gridContainer) gridContainer.classList.add("hidden");
    if (paginationContainer) paginationContainer.classList.add("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  // Sayfalama hesabı
  const perPageVal = state.membersFilters.perPage;
  const perPage = perPageVal === "all" ? filtered.length : parseInt(perPageVal, 10) || 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.membersFilters.page > totalPages) {
    state.membersFilters.page = totalPages;
  }
  const page = state.membersFilters.page;
  const startIdx = (page - 1) * perPage;
  const pageItems = filtered.slice(startIdx, startIdx + perPage);

  // Görünüm seçimi
  const isTable = state.membersFilters.viewMode === "table";
  if (tableContainer) tableContainer.classList.toggle("hidden", !isTable);
  if (gridContainer) gridContainer.classList.toggle("hidden", isTable);

  if (isTable) {
    const tbody = $("#members-table-body");
    if (tbody) {
      tbody.innerHTML = pageItems
        .map(
          (m) => `
        <tr class="hover:bg-[#1f1f1f] transition group">
          <!-- Üye Bilgisi -->
          <td class="py-3 px-4">
            <div class="flex items-center gap-3">
              <div class="relative shrink-0 cursor-pointer" onclick="openMemberModalById('${m.id}')">
                <img src="${escapeHtml(m.avatarUrl || '')}" class="w-9 h-9 rounded-full bg-zinc-800 border border-[#262626] object-cover" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="" />
                ${m.inVoice ? `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border border-[#141414]" title="Seste: ${escapeHtml(m.voiceChannelName || 'Bilinmiyor')}"></span>` : ""}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-bold text-[#F1F1F1] hover:text-[#FFE000] cursor-pointer transition truncate max-w-[150px]" onclick="openMemberModalById('${m.id}')">
                    ${escapeHtml(m.displayName || m.username)}
                  </span>
                  ${m.isBot ? `<span class="text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1 py-0.2 rounded font-bold">BOT</span>` : ""}
                  ${m.isBoosting ? `<span class="text-[10px] text-pink-400" title="Sunucu Takviyecisi"><i class="fa-solid fa-bolt"></i></span>` : ""}
                  ${m.isAdmin ? `<span class="text-[10px] text-amber-400" title="Yönetici"><i class="fa-solid fa-crown"></i></span>` : ""}
                </div>
                <div class="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <span class="truncate max-w-[120px]">@${escapeHtml(m.username)}</span>
                  <span class="text-zinc-600">•</span>
                  <button type="button" class="text-zinc-500 hover:text-[#FFE000] transition font-mono text-[10px]" onclick="copyTextToClipboard('${m.id}', 'Kullanıcı ID kopyalandı!')" title="ID Kopyala">
                    ${m.id}
                  </button>
                </div>
              </div>
            </div>
          </td>

          <!-- Roller -->
          <td class="py-3 px-4">
            ${renderMemberRoleBadges(m)}
          </td>

          <!-- Katılma Tarihi -->
          <td class="py-3 px-4">
            <div class="font-medium text-[#F1F1F1] text-[11px]">${formatMemberExactDate(m.joinedTimestamp)}</div>
            <div class="text-[10px] text-zinc-500">${formatMemberRelativeTime(m.joinedTimestamp)}</div>
          </td>

          <!-- Hesap Yaşı -->
          <td class="py-3 px-4">
            <div class="font-medium text-[#F1F1F1] text-[11px]">${formatMemberExactDate(m.createdTimestamp)}</div>
            <div class="text-[10px] text-zinc-500">${formatMemberRelativeTime(m.createdTimestamp)}</div>
          </td>

          <!-- Durum / Rozetler -->
          <td class="py-3 px-4">
            ${renderMemberStatusChips(m)}
          </td>

          <!-- İşlemler -->
          <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button type="button" class="btn btn-sm" onclick="openMemberModalById('${m.id}')" title="Üye Detayları">
                <i class="fa-solid fa-address-card"></i> Detay
              </button>
              <button type="button" class="btn btn-sm" onclick="copyTextToClipboard('${m.id}', 'ID kopyalandı!')" title="ID Kopyala">
                <i class="fa-regular fa-copy"></i>
              </button>
              <button type="button" class="btn btn-sm" onclick="copyTextToClipboard('<@${m.id}>', 'Mention kopyalandı!')" title="Mention Kopyala">
                <i class="fa-solid fa-at"></i>
              </button>
            </div>
          </td>
        </tr>`
        )
        .join("");
    }
  } else {
    // Grid (Kart Görünümü)
    if (gridContainer) {
      gridContainer.innerHTML = pageItems
        .map(
          (m) => `
        <div class="bg-[#1c1c1c] border border-[#262626] hover:border-zinc-600 rounded-xl overflow-hidden transition group flex flex-col justify-between shadow-sm" style="border-top: 3px solid ${m.highestRole?.color || "#3b82f6"};">
          <div class="p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="relative cursor-pointer" onclick="openMemberModalById('${m.id}')">
                <img src="${escapeHtml(m.avatarUrl || '')}" class="w-12 h-12 rounded-xl bg-zinc-800 border border-[#262626] object-cover" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="" />
                ${m.inVoice ? `<span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#1c1c1c]" title="Seste"></span>` : ""}
              </div>
              <div class="flex items-center gap-1">
                <button type="button" class="btn btn-sm" onclick="copyTextToClipboard('${m.id}', 'ID kopyalandı!')" title="ID Kopyala">
                  <i class="fa-regular fa-copy"></i>
                </button>
                <button type="button" class="btn btn-sm" onclick="copyTextToClipboard('<@${m.id}>', 'Mention kopyalandı!')" title="Mention Kopyala">
                  <i class="fa-solid fa-at"></i>
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <h4 class="font-bold text-sm text-[#F1F1F1] group-hover:text-[#FFE000] transition cursor-pointer truncate max-w-[160px]" onclick="openMemberModalById('${m.id}')">${escapeHtml(m.displayName || m.username)}</h4>
                ${m.isBot ? `<span class="badge badge-purple">BOT</span>` : ""}
              </div>
              <div class="text-xs text-zinc-400 truncate">@${escapeHtml(m.username)}</div>
            </div>

            <div class="pt-0.5">
              ${
                m.highestRole
                  ? `
                <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#141414] border border-[#262626]">
                  <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${m.highestRole.color};"></span>
                  <span class="truncate max-w-[140px] text-zinc-300">${escapeHtml(m.highestRole.name)}</span>
                </div>`
                  : `<span class="text-[11px] text-zinc-500">Rolsüz Üye</span>`
              }
            </div>

            <div class="grid grid-cols-2 gap-2 pt-2 border-t border-[#262626] text-[11px]">
              <div>
                <span class="text-zinc-500 block text-[10px]">Katılma:</span>
                <span class="text-zinc-300 font-medium">${formatMemberRelativeTime(m.joinedTimestamp)}</span>
              </div>
              <div>
                <span class="text-zinc-500 block text-[10px]">Hesap:</span>
                <span class="text-zinc-300 font-medium">${formatMemberRelativeTime(m.createdTimestamp)}</span>
              </div>
            </div>

            <div class="flex flex-wrap gap-1 pt-0.5 min-h-[22px]">
              ${renderMemberStatusChips(m, true)}
            </div>
          </div>

          <div class="p-3 bg-[#161616] border-t border-[#262626]">
            <button type="button" class="btn w-full" onclick="openMemberModalById('${m.id}')">
              <i class="fa-solid fa-address-card"></i> Detaylı İncele
            </button>
          </div>
        </div>`
        )
        .join("");
    }
  }

  // Sayfalama butonları
  if (paginationContainer) {
    paginationContainer.classList.remove("hidden");
    const info = $("#members-pagination-info");
    if (info) {
      const endIdx = Math.min(startIdx + perPage, filtered.length);
      info.textContent = `Sayfa ${page} / ${totalPages} (Toplam ${filtered.length} üyeden ${startIdx + 1} - ${endIdx} arası gösteriliyor)`;
    }

    const btnsContainer = $("#members-pagination-buttons");
    if (btnsContainer) {
      if (totalPages <= 1) {
        btnsContainer.innerHTML = "";
      } else {
        let btnsHtml = "";
        // İlk & Önceki
        btnsHtml += `
          <button type="button" class="btn btn-sm pagination-btn" ${page <= 1 ? "disabled" : ""} onclick="changeMemberPage(1)" title="İlk Sayfa">
            <i class="fa-solid fa-angles-left"></i>
          </button>
          <button type="button" class="btn btn-sm pagination-btn" ${page <= 1 ? "disabled" : ""} onclick="changeMemberPage(${page - 1})" title="Önceki Sayfa">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
        `;

        // Sayfa numaraları (Max 5 numara)
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
          startPage = Math.max(1, endPage - 4);
        }

        for (let p = startPage; p <= endPage; p++) {
          const isActive = p === page;
          btnsHtml += `
            <button type="button" class="btn btn-sm pagination-btn ${isActive ? "btn-primary" : ""}" onclick="changeMemberPage(${p})">
              ${p}
            </button>
          `;
        }

        // Sonraki & Son
        btnsHtml += `
          <button type="button" class="btn btn-sm pagination-btn" ${page >= totalPages ? "disabled" : ""} onclick="changeMemberPage(${page + 1})" title="Sonraki Sayfa">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <button type="button" class="btn btn-sm pagination-btn" ${page >= totalPages ? "disabled" : ""} onclick="changeMemberPage(${totalPages})" title="Son Sayfa">
            <i class="fa-solid fa-angles-right"></i>
          </button>
        `;

        btnsContainer.innerHTML = btnsHtml;
      }
    }
  }
}

window.changeMemberPage = function(newPage) {
  state.membersFilters.page = newPage;
  renderFilteredMembers();
  // Üst tabloya hafif kaydır
  $("#tab-members")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

async function loadMembers(forceRefresh = false) {
  if (!state.selectedGuildId) return;

  const skeleton = $("#members-loading-skeleton");
  const tableContainer = $("#members-table-container");
  const gridContainer = $("#members-grid-container");
  const emptyState = $("#members-empty-state");
  const paginationContainer = $("#members-pagination-container");
  const refreshBtn = $("#members-refresh-btn");

  if (skeleton) skeleton.classList.remove("hidden");
  if (tableContainer) tableContainer.classList.add("hidden");
  if (gridContainer) gridContainer.classList.add("hidden");
  if (emptyState) emptyState.classList.add("hidden");
  if (paginationContainer) paginationContainer.classList.add("hidden");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Yükleniyor...`;
  }

  try {
    const res = await api(`/api/members?guildId=${encodeURIComponent(state.selectedGuildId)}${forceRefresh ? "&forceRefresh=true" : ""}`);
    const data = await res.json();

    state.members = data.members || [];
    state.memberRoles = data.roles || [];
    state.memberStats = data.stats || {};

    // Rol dropdown'ını doldur
    const roleSelect = $("#members-role-filter");
    if (roleSelect) {
      const currentRole = state.membersFilters.roleId;
      roleSelect.innerHTML = `
        <option value="all" data-icon="fa-solid fa-shield">Tüm Roller (Hepsi)</option>
        <option value="no_roles" data-icon="fa-solid fa-user-slash">Rolsüz Üyeler</option>
      `;
      for (const r of state.memberRoles) {
        const opt = new Option(`${r.name} (${r.memberCount})`, r.id);
        if (r.color && r.color !== "#000000") {
          opt.dataset.color = r.color;
        } else {
          opt.dataset.icon = "fa-solid fa-shield";
        }
        roleSelect.appendChild(opt);
      }
      roleSelect.value = currentRole || "all";
      createCustomSelect(roleSelect);
    }

    // KPI Kartları sayılarını doldur
    const stats = state.memberStats;
    $("#mf-stat-total").textContent = String(stats.total || state.members.length);
    $("#mf-stat-humans").textContent = String(stats.humans || 0);
    $("#mf-stat-bots").textContent = String(stats.bots || 0);
    $("#mf-stat-boosters").textContent = String(stats.boosters || 0);
    $("#mf-stat-voice").textContent = String(stats.inVoice || 0);
    $("#mf-stat-admins").textContent = String(stats.admins || 0);
    $("#mf-stat-timeout").textContent = String(stats.timedOut || 0);
    $("#mf-stat-recent").textContent = String(stats.recent7d || 0);

    renderFilteredMembers();
  } catch (err) {
    toast(`Üyeler yüklenemedi: ${err.message}`, "error");
  } finally {
    if (skeleton) skeleton.classList.add("hidden");
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Yenile`;
    }
  }
}

function exportMembersToCsv() {
  const members = getFilteredMembers();
  if (members.length === 0) {
    toast("Dışa aktarılacak üye bulunamadı!", "error");
    return;
  }
  const headers = [
    "Kullanıcı ID",
    "Kullanıcı Adı",
    "Görünen Ad",
    "Takma Ad",
    "Bot Mu",
    "Katılma Tarihi",
    "Hesap Açılış Tarihi",
    "En Yüksek Rol",
    "Tüm Roller",
    "Takviyeci (Boost)",
    "Seste Mi",
    "Ses Kanalı",
    "Zamanaşımı (Cezalı)",
    "Yönetici Mi",
  ];
  const rows = members.map((m) => [
    `"${m.id}"`,
    `"${(m.username || "").replace(/"/g, '""')}"`,
    `"${(m.displayName || "").replace(/"/g, '""')}"`,
    `"${(m.nickname || "").replace(/"/g, '""')}"`,
    m.isBot ? "Evet" : "Hayır",
    m.joinedAt ? `"${m.joinedAt}"` : `""`,
    `"${m.createdAt}"`,
    `"${(m.highestRole?.name || "").replace(/"/g, '""')}"`,
    `"${(m.roles ? m.roles.map((r) => r.name).join(", ") : "").replace(/"/g, '""')}"`,
    m.isBoosting ? "Evet" : "Hayır",
    m.inVoice ? "Evet" : "Hayır",
    `"${(m.voiceChannelName || "").replace(/"/g, '""')}"`,
    m.isTimedOut ? "Evet" : "Hayır",
    m.isAdmin ? "Evet" : "Hayır",
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const guildName = state.guilds.find((g) => g.id === state.selectedGuildId)?.name || "sunucu";
  a.href = url;
  a.download = `uyeler-${guildName.replace(/[^a-zA-Z0-9_\u0080-\uFFFF-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`${members.length} üye CSV olarak başarıyla indirildi.`);
}

function exportMembersToJson() {
  const members = getFilteredMembers();
  if (members.length === 0) {
    toast("Dışa aktarılacak üye bulunamadı!", "error");
    return;
  }
  const jsonContent = JSON.stringify(members, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const guildName = state.guilds.find((g) => g.id === state.selectedGuildId)?.name || "sunucu";
  a.href = url;
  a.download = `uyeler-${guildName.replace(/[^a-zA-Z0-9_\u0080-\uFFFF-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`${members.length} üye JSON olarak başarıyla indirildi.`);
}

function initMembersControls() {
  // Görünüm Seçici (Tablo vs Kart)
  const viewTableBtn = $("#members-view-table-btn");
  const viewGridBtn = $("#members-view-grid-btn");

  if (viewTableBtn && viewGridBtn) {
    viewTableBtn.onclick = () => {
      state.membersFilters.viewMode = "table";
      viewTableBtn.className = "btn btn-primary btn-sm";
      viewGridBtn.className = "btn btn-sm";
      renderFilteredMembers();
    };

    viewGridBtn.onclick = () => {
      state.membersFilters.viewMode = "grid";
      viewGridBtn.className = "btn btn-primary btn-sm";
      viewTableBtn.className = "btn btn-sm";
      renderFilteredMembers();
    };
  }

  // Yenile Butonu
  const refreshBtn = $("#members-refresh-btn");
  if (refreshBtn) {
    refreshBtn.onclick = () => loadMembers(true);
  }

  // Dışa Aktar Menüsü
  const exportBtn = $("#members-export-btn");
  const exportMenu = $("#members-export-menu");
  if (exportBtn && exportMenu) {
    exportBtn.onclick = (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle("hidden");
    };
    document.addEventListener("click", () => exportMenu.classList.add("hidden"));

    $("#export-csv-btn")?.addEventListener("click", () => {
      exportMenu.classList.add("hidden");
      exportMembersToCsv();
    });
    $("#export-json-btn")?.addEventListener("click", () => {
      exportMenu.classList.add("hidden");
      exportMembersToJson();
    });
  }

  // Arama Girişi
  const searchInput = $("#members-search-input");
  const searchClear = $("#members-search-clear");
  let searchTimer;
  if (searchInput) {
    searchInput.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.membersFilters.search = searchInput.value.trim();
        state.membersFilters.page = 1;
        if (searchClear) searchClear.classList.toggle("hidden", !searchInput.value.trim());
        renderFilteredMembers();
      }, 150);
    };
  }
  if (searchClear && searchInput) {
    searchClear.onclick = () => {
      searchInput.value = "";
      state.membersFilters.search = "";
      state.membersFilters.page = 1;
      searchClear.classList.add("hidden");
      renderFilteredMembers();
    };
  }

  // Dropdown Filtreler (Özel Tasarımlı Dropdown Entegrasyonu)
  const typeFilter = $("#members-type-filter");
  if (typeFilter) {
    createCustomSelect(typeFilter);
    typeFilter.onchange = () => {
      state.membersFilters.type = typeFilter.value;
      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  }

  const roleFilter = $("#members-role-filter");
  if (roleFilter) {
    createCustomSelect(roleFilter);
    roleFilter.onchange = () => {
      state.membersFilters.roleId = roleFilter.value;
      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  }

  const statusFilter = $("#members-status-filter");
  if (statusFilter) {
    createCustomSelect(statusFilter);
    statusFilter.onchange = () => {
      state.membersFilters.status = statusFilter.value;
      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  }

  const joinDateFilter = $("#members-join-date-filter");
  if (joinDateFilter) {
    createCustomSelect(joinDateFilter);
    joinDateFilter.onchange = () => {
      state.membersFilters.joinDate = joinDateFilter.value;
      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  }

  const ageFilter = $("#members-age-filter");
  if (ageFilter) {
    createCustomSelect(ageFilter);
    ageFilter.onchange = () => {
      state.membersFilters.age = ageFilter.value;
      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  }

  const sortFilter = $("#members-sort-filter");
  if (sortFilter) {
    createCustomSelect(sortFilter);
    sortFilter.onchange = () => {
      state.membersFilters.sortBy = sortFilter.value;
      renderFilteredMembers();
    };
  }

  const perPageSelect = $("#members-per-page");
  if (perPageSelect) {
    createCustomSelect(perPageSelect);
    perPageSelect.onchange = () => {
      state.membersFilters.perPage = perPageSelect.value;
      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  }

  const timeoutDuration = $("#mdm-timeout-duration");
  if (timeoutDuration) {
    createCustomSelect(timeoutDuration);
  }

  // Filtreleri Sıfırla Butonları
  const resetBtn = $("#members-reset-filters-btn");
  const emptyResetBtn = $("#members-empty-reset-btn");
  const resetAllFilters = () => {
    state.membersFilters.search = "";
    state.membersFilters.type = "all";
    state.membersFilters.roleId = "all";
    state.membersFilters.status = "all";
    state.membersFilters.joinDate = "all";
    state.membersFilters.age = "all";
    state.membersFilters.sortBy = "joined_desc";
    state.membersFilters.page = 1;

    if (searchInput) searchInput.value = "";
    if (searchClear) searchClear.classList.add("hidden");
    if (typeFilter) { typeFilter.value = "all"; syncCustomSelect(typeFilter); }
    if (roleFilter) { roleFilter.value = "all"; syncCustomSelect(roleFilter); }
    if (statusFilter) { statusFilter.value = "all"; syncCustomSelect(statusFilter); }
    if (joinDateFilter) { joinDateFilter.value = "all"; syncCustomSelect(joinDateFilter); }
    if (ageFilter) { ageFilter.value = "all"; syncCustomSelect(ageFilter); }
    if (sortFilter) { sortFilter.value = "joined_desc"; syncCustomSelect(sortFilter); }

    renderFilteredMembers();
  };
  if (resetBtn) resetBtn.onclick = resetAllFilters;
  if (emptyResetBtn) emptyResetBtn.onclick = resetAllFilters;

  // KPI Hızlı Filtre Kartları
  document.querySelectorAll(".member-filter-card").forEach((card) => {
    card.onclick = () => {
      if (card.id === "filter-card-all") {
        resetAllFilters();
        return;
      }

      const typeVal = card.dataset.typeFilter;
      const statusVal = card.dataset.statusFilter;

      if (typeVal) {
        state.membersFilters.type = state.membersFilters.type === typeVal ? "all" : typeVal;
        state.membersFilters.status = "all";
        if (typeFilter) { typeFilter.value = state.membersFilters.type; syncCustomSelect(typeFilter); }
        if (statusFilter) { statusFilter.value = "all"; syncCustomSelect(statusFilter); }
      } else if (statusVal) {
        state.membersFilters.status = state.membersFilters.status === statusVal ? "all" : statusVal;
        state.membersFilters.type = "all";
        if (statusFilter) { statusFilter.value = state.membersFilters.status; syncCustomSelect(statusFilter); }
        if (typeFilter) { typeFilter.value = "all"; syncCustomSelect(typeFilter); }
      }

      state.membersFilters.page = 1;
      renderFilteredMembers();
    };
  });

  // Modal İşlemleri
  const modalCloseBtn = $("#mdm-close-btn");
  const modalFooterClose = $("#mdm-footer-close-btn");
  const memberModal = $("#member-detail-modal");

  if (modalCloseBtn) modalCloseBtn.onclick = closeMemberModal;
  if (modalFooterClose) modalFooterClose.onclick = closeMemberModal;
  if (memberModal) {
    memberModal.onclick = (e) => {
      if (e.target === memberModal) closeMemberModal();
    };
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && memberModal && !memberModal.classList.contains("hidden")) {
      closeMemberModal();
    }
  });

  // Modal Kopyalama Butonları
  $("#mdm-copy-id")?.addEventListener("click", () => {
    if (state.selectedMember) copyTextToClipboard(state.selectedMember.id, "Kullanıcı ID kopyalandı!");
  });
  $("#mdm-copy-mention")?.addEventListener("click", () => {
    if (state.selectedMember) copyTextToClipboard(`<@${state.selectedMember.id}>`, "Mention kopyalandı!");
  });

  // Moderasyon: Zamanaşımı
  $("#mdm-timeout-apply-btn")?.addEventListener("click", () => {
    const duration = $("#mdm-timeout-duration")?.value || "5";
    handleMemberAction("timeout", { durationMinutes: duration });
  });

  // Moderasyon: Takma Ad
  $("#mdm-nickname-save-btn")?.addEventListener("click", () => {
    const nick = $("#mdm-nickname-input")?.value;
    handleMemberAction("setNickname", { nickname: nick });
  });

  // Dashboard'daki toplam üye kartına tıklandığında üyeler sekmesine geç
  const statMembersCard = $("#stat-members-card");
  if (statMembersCard) {
    statMembersCard.onclick = () => {
      const tabBtn = document.querySelector('.tab-btn[data-tab="members"]');
      if (tabBtn) tabBtn.click();
    };
  }
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
      guildSelector.onchange = async () => {
        const newGuildId = guildSelector.value;
        if (!newGuildId || newGuildId === state.selectedGuildId) return;
        state.selectedGuildId = newGuildId;
        localStorage.setItem("selected_guild_id", newGuildId);

        const [newSettings, _] = await Promise.all([
          api(`/api/settings?guildId=${encodeURIComponent(newGuildId)}`).then((r) => r.json()),
          loadGuildRoles(newGuildId),
        ]);
        state.settings = newSettings;
        fillChannelSelects();
        await fillSteamRoleSelect();
        bindForms();
        loadDashboardStats();
      };
    }

    const [settings, bot] = await Promise.all([
      api(`/api/settings?guildId=${encodeURIComponent(activeGuildId)}`).then((r) => r.json()),
      api(`/api/bot?guildId=${encodeURIComponent(activeGuildId)}`).then((r) => r.json()),
      loadGuildRoles(activeGuildId),
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
        badge.className = "sidebar-status-badge online";
        badge.title = "Çevrimiçi (Discord'a bağlı)";
      } else {
        badge.className = "sidebar-status-badge offline";
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
    initMembersControls();
    initSteamControls();
    renderLayerList();
    renderProps();
    draw();
    loadDashboardStats();
    initAllCustomSelects();
  } catch (err) {
    toast(`Panel yüklenemedi: ${err.message}`, "error");
  }
}

init();
