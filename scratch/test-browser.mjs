import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const PROFILE_DIR = path.resolve("./scratch/edge-profile");

fs.mkdirSync(PROFILE_DIR, { recursive: true });

console.log("Edge başlatılıyor...");
const edgeProcess = spawn(EDGE_PATH, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE_DIR}`,
  "--no-first-run",
  "--no-default-browser-check",
  "http://127.0.0.1:3000"
], { stdio: "ignore" });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  try {
    // Portun hazır olmasını bekle
    let targets = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        targets = await res.json();
        if (targets && targets.length > 0) break;
      } catch (e) {}
    }

    if (!targets || targets.length === 0) {
      throw new Error("Edge hedeflerine bağlanılamadı!");
    }

    const pageTarget = targets.find(t => t.type === "page") || targets[0];
    console.log("Hedef bulundu:", pageTarget.title, pageTarget.url);

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const pendingCallbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingCallbacks.has(msg.id)) {
        pendingCallbacks.get(msg.id)(msg);
        pendingCallbacks.delete(msg.id);
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        console.log(`[Tarayıcı Konsolu ${msg.params.type}]:`, ...msg.params.args.map(a => a.value || a.description));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        console.error("[Tarayıcı JS Hatası]:", msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
      }
    };

    function sendCommand(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pendingCallbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCommand("Runtime.enable");
    await sendCommand("Page.enable");

    console.log("Sayfa yüklenmesi için 2 saniye bekleniyor...");
    await sleep(2000);

    // Adım 1: Dashboard görünümünü aç (gerekirse)
    const viewCheck = await sendCommand("Runtime.evaluate", {
      expression: `
        (function() {
          const landing = document.getElementById("app-landing-view");
          const dashboard = document.getElementById("app-dashboard-layout");
          const isDashboardVisible = dashboard && !dashboard.classList.contains("hidden");
          if (!isDashboardVisible) {
            // Dashboard'a geç
            localStorage.setItem("syncbot_auth", "1");
            if (window.Navigation?.ViewManager) {
              window.Navigation.ViewManager.setView("dashboard", true);
            } else {
              if (landing) landing.classList.add("hidden");
              if (dashboard) dashboard.classList.remove("hidden");
            }
          }
          return {
            landingHidden: landing?.classList.contains("hidden"),
            dashboardHidden: dashboard?.classList.contains("hidden"),
            sidebarExists: Boolean(document.getElementById("sidebar")),
            toggleExists: Boolean(document.getElementById("sidebar-toggle"))
          };
        })()
      `,
      returnByValue: true
    });
    console.log("Görünüm Durumu:", viewCheck.result?.value);

    // Adım 2: Sidebar başlangıç durumunu incele
    const initialStatus = await sendCommand("Runtime.evaluate", {
      expression: `
        (function() {
          const s = document.getElementById("sidebar");
          const btn = document.getElementById("sidebar-toggle");
          if (!s || !btn) return { error: "Eleman bulunamadı" };
          const rect = s.getBoundingClientRect();
          const comp = window.getComputedStyle(s);
          return {
            classes: s.className,
            renderedWidth: rect.width,
            computedWidth: comp.width,
            buttonClasses: btn.className,
            buttonOnclick: btn.getAttribute("onclick")
          };
        })()
      `,
      returnByValue: true
    });
    console.log("1. Başlangıç Durumu:", initialStatus.result?.value);

    // Adım 3: Butona Tıkla!
    console.log("Butona 1. kez tıklanıyor (#sidebar-toggle)...");
    const click1 = await sendCommand("Runtime.evaluate", {
      expression: `
        (function() {
          const btn = document.getElementById("sidebar-toggle");
          if (!btn) return { error: "Buton yok" };
          btn.click();
          return { clicked: true };
        })()
      `,
      returnByValue: true
    });
    console.log("1. Tıklama Yanıtı:", click1.result?.value);

    // CSS animasyon süresi kadar bekle (0.25s = 250ms)
    await sleep(400);

    const afterClick1 = await sendCommand("Runtime.evaluate", {
      expression: `
        (function() {
          const s = document.getElementById("sidebar");
          const rect = s.getBoundingClientRect();
          const comp = window.getComputedStyle(s);
          return {
            classes: s.className,
            renderedWidth: rect.width,
            computedWidth: comp.width
          };
        })()
      `,
      returnByValue: true
    });
    console.log("2. 1. Tıklama Sonrası Durum:", afterClick1.result?.value);

    // Adım 4: Butona Tekrar Tıkla!
    console.log("Butona 2. kez tıklanıyor (#sidebar-toggle)...");
    const click2 = await sendCommand("Runtime.evaluate", {
      expression: `
        (function() {
          const btn = document.getElementById("sidebar-toggle");
          btn.click();
          return { clicked: true };
        })()
      `,
      returnByValue: true
    });

    await sleep(400);

    const afterClick2 = await sendCommand("Runtime.evaluate", {
      expression: `
        (function() {
          const s = document.getElementById("sidebar");
          const rect = s.getBoundingClientRect();
          const comp = window.getComputedStyle(s);
          return {
            classes: s.className,
            renderedWidth: rect.width,
            computedWidth: comp.width
          };
        })()
      `,
      returnByValue: true
    });
    console.log("3. 2. Tıklama Sonrası Durum:", afterClick2.result?.value);

    ws.close();
  } catch (err) {
    console.error("Test hatası:", err);
  } finally {
    edgeProcess.kill();
    console.log("Test tamamlandı.");
  }
}

runTest();
