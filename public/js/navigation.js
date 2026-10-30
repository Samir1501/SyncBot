// ============================================================
//  SyncBot - Navigasyon, Sekme Yönlendirme ve Modal Yöneticisi
// ============================================================

(function (window) {
  "use strict";

  // 1. GÖRÜNÜM YÖNETİCİSİ (ViewManager: Landing vs Dashboard)
  const ViewManager = {
    currentView: null,

    init() {
      const hasAuth = localStorage.getItem("syncbot_auth") === "1";
      this.setView(hasAuth ? "dashboard" : "landing", false);
    },

    setView(view, persist = true) {
      this.currentView = view;
      const landing = document.getElementById("app-landing-view");
      const dashboard = document.getElementById("app-dashboard-layout");

      if (view === "dashboard") {
        if (persist) {
          try {
            localStorage.setItem("syncbot_auth", "1");
            document.documentElement.classList.add("auth-hint");
          } catch (e) {}
        }
        if (landing) landing.classList.add("hidden");
        if (dashboard) dashboard.classList.remove("hidden");
      } else {
        if (persist) {
          try {
            localStorage.removeItem("syncbot_auth");
            document.documentElement.classList.remove("auth-hint");
          } catch (e) {}
        }
        if (landing) landing.classList.remove("hidden");
        if (dashboard) dashboard.classList.add("hidden");
        ModalManager.closeAll();
      }
    },

    getView() {
      return this.currentView;
    },
  };

  // 2. MODAL YÖNETİCİSİ (ModalManager)
  const ModalManager = {
    activeModals: new Set(),
    initialized: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      // Global Escape tuşu dinleyicisi
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.activeModals.size > 0) {
          this.closeTop();
        }
      });

      // Global backdrop tıklama dinleyicisi
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (!target) return;
        if (
          target.classList.contains("modal-backdrop") ||
          (target.id && target.id.endsWith("-modal") && target.classList.contains("fixed"))
        ) {
          this.close(target.id);
        }
      });
    },

    open(modalId) {
      const modal = typeof modalId === "string" ? document.getElementById(modalId) : modalId;
      if (!modal) return;
      modal.classList.remove("hidden");
      this.activeModals.add(modal.id);
      document.body.classList.add("modal-open");
    },

    close(modalId) {
      const modal = typeof modalId === "string" ? document.getElementById(modalId) : modalId;
      if (!modal) return;
      modal.classList.add("hidden");
      this.activeModals.delete(modal.id);
      if (this.activeModals.size === 0) {
        document.body.classList.remove("modal-open");
      }
    },

    closeTop() {
      if (this.activeModals.size === 0) return;
      const ids = Array.from(this.activeModals);
      const topId = ids[ids.length - 1];
      this.close(topId);
    },

    closeAll() {
      this.activeModals.forEach((id) => {
        const m = document.getElementById(id);
        if (m) m.classList.add("hidden");
      });
      this.activeModals.clear();
      document.body.classList.remove("modal-open");
    },

    isOpen(modalId) {
      return this.activeModals.has(modalId);
    },
  };

  // 3. KENAR ÇUBUĞU YÖNETİCİSİ (SidebarManager)
  const SidebarManager = {
    initialized: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      // Hafızadaki durumu kontrol et ve açılışta uygula
      try {
        if (localStorage.getItem("syncbot_sidebar_collapsed") === "1") {
          const sidebar = document.getElementById("sidebar");
          if (sidebar) sidebar.classList.add("collapsed");
          document.documentElement.classList.add("sidebar-collapsed-hint");
        }
      } catch (e) {}

      // Tıklama olayını document seviyesinde event delegation ile anında yakala
      document.addEventListener("click", (e) => {
        const toggleBtn = e.target.closest("#sidebar-toggle");
        if (toggleBtn) {
          e.preventDefault();
          this.toggle(e);
        }
      });
    },

    toggle(e) {
      if (typeof window.toggleSidebar === "function") {
        return window.toggleSidebar(e);
      }
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return false;
      const isCollapsed = sidebar.classList.toggle("collapsed");
      document.documentElement.classList.toggle("sidebar-collapsed-hint", isCollapsed);
      try {
        localStorage.setItem("syncbot_sidebar_collapsed", isCollapsed ? "1" : "0");
      } catch (err) {}
      return isCollapsed;
    },

    collapse() {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return;
      sidebar.classList.add("collapsed");
      document.documentElement.classList.add("sidebar-collapsed-hint");
      try {
        localStorage.setItem("syncbot_sidebar_collapsed", "1");
      } catch (e) {}
    },

    expand() {
      const sidebar = document.getElementById("sidebar");
      if (!sidebar) return;
      sidebar.classList.remove("collapsed");
      document.documentElement.classList.remove("sidebar-collapsed-hint");
      try {
        localStorage.setItem("syncbot_sidebar_collapsed", "0");
      } catch (e) {}
    },

    isCollapsed() {
      const sidebar = document.getElementById("sidebar");
      return sidebar ? sidebar.classList.contains("collapsed") : false;
    },
  };

  // 4. SEKME YÖNLENDİRİCİSİ (TabRouter)
  const TabRouter = {
    currentTab: "dashboard",
    registry: {},
    initialized: false,

    register(tabId, config) {
      this.registry[tabId] = {
        title: config.title || tabId,
        hasSave: Boolean(config.hasSave),
        onEnter: config.onEnter || null,
        onLeave: config.onLeave || null,
      };
    },

    init(defaultTab = "dashboard") {
      if (!this.initialized) {
        this.initialized = true;

        // Sekme butonlarını event delegation ile güvenli dinle
        document.addEventListener("click", (e) => {
          const btn = e.target.closest(".tab-btn");
          if (btn && btn.dataset.tab) {
            e.preventDefault();
            this.navigateTo(btn.dataset.tab, true);
          }
        });

        // URL Hash dinleyicisi (Tarayıcı Geri/İleri ve doğrudan link)
        window.addEventListener("hashchange", () => {
          const hash = window.location.hash.replace(/^#/, "");
          if (hash && this.registry[hash]) {
            this.navigateTo(hash, false);
          }
        });
      }

      // Sayfa ilk yüklendiğinde hash varsa o sekmeyi, yoksa default sekmeyi aç
      const initialHash = window.location.hash.replace(/^#/, "");
      const targetTab = initialHash && this.registry[initialHash] ? initialHash : defaultTab;
      this.navigateTo(targetTab, false);
    },

    navigateTo(tabId, updateHash = true) {
      if (!this.registry[tabId]) {
        console.warn(`[TabRouter] Tanımsız sekme: ${tabId}`);
        return;
      }

      const prevTab = this.currentTab;
      if (prevTab && prevTab !== tabId && this.registry[prevTab]?.onLeave) {
        try {
          this.registry[prevTab].onLeave();
        } catch (e) {
          console.error(`[TabRouter] ${prevTab} onLeave hatası:`, e);
        }
      }

      this.currentTab = tabId;
      const config = this.registry[tabId];

      // 1. Tab butonlarının aktifliğini güncelle
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });

      // 2. Tab section'larının görünürlüğünü güncelle
      Object.keys(this.registry).forEach((id) => {
        const section = document.getElementById(`tab-${id}`);
        if (section) {
          section.classList.toggle("hidden", id !== tabId);
        }
      });

      // 3. Başlığı güncelle
      const titleEl = document.getElementById("page-title");
      if (titleEl) {
        titleEl.textContent = config.title;
      }

      // 4. Kaydet butonunu göster/gizle
      const saveBtn = document.getElementById("save-btn");
      const saveStatus = document.getElementById("save-status");
      if (saveBtn) saveBtn.classList.toggle("hidden", !config.hasSave);
      if (saveStatus) saveStatus.classList.toggle("hidden", !config.hasSave);

      // 5. Açık dropdownları kapat
      document.querySelectorAll(".dropdown.open, .custom-select-wrapper.open").forEach((w) => {
        w.classList.remove("open");
      });

      // 6. Sayfayı en üste kaydır
      const mainContent = document.getElementById("main-content");
      if (mainContent) {
        mainContent.scrollTo({ top: 0, behavior: "instant" });
      }

      // 7. URL Hash'ini senkronize et
      if (updateHash && window.location.hash !== `#${tabId}`) {
        window.history.replaceState(null, "", `#${tabId}`);
      }

      // 8. onEnter kancasını çalıştır
      if (typeof config.onEnter === "function") {
        try {
          config.onEnter();
        } catch (err) {
          console.error(`[TabRouter] ${tabId} onEnter hatası:`, err);
        }
      }
    },

    getCurrentTab() {
      return this.currentTab;
    },

    refreshCurrentTab() {
      const config = this.registry[this.currentTab];
      if (config && typeof config.onEnter === "function") {
        try {
          config.onEnter();
        } catch (e) {
          console.error(`[TabRouter] refreshCurrentTab hatası:`, e);
        }
      }
    },
  };

  window.Navigation = {
    ViewManager,
    ModalManager,
    SidebarManager,
    TabRouter,
  };

  // Temel yöneticileri DOM hazır olduğunda veya anında başlat
  const autoInit = () => {
    try {
      SidebarManager.init();
      ModalManager.init();
    } catch (e) {
      console.warn("[Navigation] AutoInit hatası:", e);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})(window);
