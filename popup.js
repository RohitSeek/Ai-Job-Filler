// popup.js — ALL event listeners attached here, NO inline handlers in HTML

const SCHEMA = [
  { k:"first_name",     l:"First Name" },
  { k:"last_name",      l:"Last Name" },
  { k:"full_name",      l:"Full Name" },
  { k:"email",          l:"Email" },
  { k:"phone",          l:"Phone" },
  { k:"address_full",   l:"Full Address (write raw, AI splits it)", big:true, hint:"e.g. NITK Surathkal Karnataka India 575025" },
  { k:"city",           l:"City" },
  { k:"state",          l:"State" },
  { k:"country",        l:"Country" },
  { k:"pincode",        l:"PIN / ZIP Code" },
  { k:"linkedin",       l:"LinkedIn URL" },
  { k:"github",         l:"GitHub URL" },
  { k:"portfolio",      l:"Portfolio / Website" },
  { k:"cur_title",      l:"Current Job Title" },
  { k:"cur_company",    l:"Current Company" },
  { k:"yoe",            l:"Years of Experience" },
  { k:"cur_ctc",        l:"Current CTC (e.g. 12 LPA)" },
  { k:"exp_ctc",        l:"Expected CTC" },
  { k:"notice",         l:"Notice Period (e.g. 30 days / Immediate)" },
  { k:"degree",         l:"Degree (e.g. B.Tech Computer Science)" },
  { k:"university",     l:"University / College" },
  { k:"grad_year",      l:"Graduation Year" },
  { k:"cgpa",           l:"CGPA / Percentage" },
  { k:"skills",         l:"Skills (comma separated)" },
  { k:"relocate",       l:"Willing to Relocate? (Yes/No)" },
  { k:"work_auth",      l:"Work Authorization (e.g. Indian Citizen)" },
  { k:"gender",         l:"Gender" },
  { k:"cover_letter",   l:"Cover Letter / Summary", big:true },
];

let tabId  = null;
let fields = [];

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  buildProfileForm();
  await loadStored();
  await initTab();
  attachListeners();
});

async function initTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return;
    tabId = tabs[0].id;
    const url = (tabs[0].url || "").replace(/^https?:\/\//, "").substring(0, 60);
    document.getElementById("urlbar").textContent = url || "(no URL)";
  } catch(e) {
    log("Tab error: " + e.message, "r");
  }
}

// ── Attach ALL event listeners here — no onclick in HTML ─────────────────────
function attachListeners() {
  // Nav tabs
  document.getElementById("nb-fill")    .addEventListener("click", () => goTo("fill"));
  document.getElementById("nb-profile") .addEventListener("click", () => goTo("profile"));
  document.getElementById("nb-settings").addEventListener("click", () => goTo("settings"));

  // Buttons
  document.getElementById("btnScan")       .addEventListener("click", doScan);
  document.getElementById("btnFill")       .addEventListener("click", doFill);
  document.getElementById("btnSaveProfile").addEventListener("click", saveProfile);
  document.getElementById("btnSaveKey")    .addEventListener("click", saveKey);

  // External link — open in new tab
  document.getElementById("linkApiKey").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://aistudio.google.com/apikey" });
  });
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(name) {
  ["fill", "profile", "settings"].forEach(n => {
    document.getElementById("pg-" + n).classList.toggle("on", n === name);
    document.getElementById("nb-" + n).classList.toggle("on", n === name);
  });
}

// ── Scan ──────────────────────────────────────────────────────────────────────
async function doScan() {
  if (!tabId) { toast("No active tab", true); return; }
  log("Scanning page...", "b");

  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: function() {
        const out = [];
        const seen = new Set();

        function labelOf(el) {
          if (el.id) {
            try {
              const lb = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
              if (lb) return lb.innerText.trim().replace(/[*:\s]+$/, "");
            } catch(e) {}
          }
          const al = el.getAttribute("aria-label");
          if (al) return al.trim();
          const lid = el.getAttribute("aria-labelledby");
          if (lid) { const e2 = document.getElementById(lid); if (e2) return e2.innerText.trim(); }
          const wrap = el.closest("label");
          if (wrap) return wrap.innerText.trim().replace(/[*:\s]+$/, "");
          const prev = el.previousElementSibling;
          if (prev && prev.innerText && prev.innerText.trim().length < 70)
            return prev.innerText.trim().replace(/[*:\s]+$/, "");
          if (el.placeholder) return el.placeholder;
          if (el.name) return el.name.replace(/[_\-]/g, " ");
          return "";
        }

        const els = document.querySelectorAll(
          'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),' +
          'textarea, select'
        );

        els.forEach(function(el, i) {
          const cs = window.getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;

          const key = (el.id || el.name || "_" + i) + el.tagName;
          if (seen.has(key)) return;
          seen.add(key);

          out.push({
            i:    i,
            tag:  el.tagName.toLowerCase(),
            type: (el.type || "text").toLowerCase(),
            id:   el.id   || "",
            name: el.name || "",
            lbl:  labelOf(el),
            ph:   el.placeholder || "",
            opts: el.tagName === "SELECT"
                  ? Array.from(el.options).map(function(o) { return o.text.trim(); }).filter(Boolean)
                  : []
          });
        });

        return out;
      }
    });

    fields = (res && res[0] && res[0].result) ? res[0].result : [];

    document.getElementById("sFound").textContent = fields.length;
    document.getElementById("sFilled").textContent = "-";
    document.getElementById("sSkip").textContent = "-";

    if (!fields.length) { log("No fields found on this page.", "y"); return; }

    // Render list
    const fl = document.getElementById("flist");
    fl.innerHTML = "";
    fields.forEach(function(f) {
      const d = document.createElement("div");
      d.className = "frow";
      d.id = "fr-" + f.i;
      const label = document.createElement("span");
      label.className = "fl";
      label.textContent = f.lbl || f.name || "field #" + f.i;
      const val = document.createElement("span");
      val.className = "fp";
      val.id = "fv-" + f.i;
      val.textContent = "-";
      d.appendChild(label);
      d.appendChild(val);
      fl.appendChild(d);
    });

    document.getElementById("btnFill").disabled = false;
    log("Found " + fields.length + " fields. Ready to fill!", "g");

  } catch(e) {
    log("Scan error: " + e.message, "r");
    toast("Scan failed", true);
  }
}

// ── Fill ──────────────────────────────────────────────────────────────────────
async function doFill() {
  const stored = await chrome.storage.local.get(["apiKey", "profile"]);
  const apiKey = stored.apiKey || "";
  const profile = stored.profile || {};

  if (!apiKey) { toast("Set your Gemini API key in Settings!", true); goTo("settings"); return; }
  if (!Object.values(profile).some(function(v) { return String(v||"").trim().length > 0; })) {
    toast("Fill your profile first!", true); goTo("profile"); return;
  }
  if (!fields.length) { toast("Scan the page first!", true); return; }

  document.getElementById("btnFill").disabled = true;
  log("Asking Gemini for " + fields.length + " fields...", "b");

  try {
    const profText = Object.entries(profile)
      .filter(function(e) { return String(e[1]||"").trim(); })
      .map(function(e) { return e[0].replace(/_/g," ") + ": " + e[1]; })
      .join("\n");

    const fieldText = fields.map(function(f) {
      return '[' + f.i + '] label="' + f.lbl + '" name="' + f.name + '" placeholder="' + f.ph + '" type="' + f.type + '" options=' + JSON.stringify(f.opts);
    }).join("\n");

    const prompt = "You fill job application forms.\n\nUSER PROFILE:\n" + profText +
      "\n\nFORM FIELDS:\n" + fieldText +
      '\n\nRules:\n- Return ONLY a JSON array, no markdown, no explanation.\n- Extract the exact value each field needs.\n- "PIN Code" -> only the PIN digits\n- "First Name" -> only first name\n- "Country" -> only country\n- Salary: match LPA vs full number from context\n- Dropdowns: match closest option\n- No match: use null\n- Format: [{"i":0,"v":"Arjun"},{"i":1,"v":null}]';

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
        })
      }
    );

    if (!r.ok) {
      const err = await r.json().catch(function(){ return {}; });
      throw new Error("Gemini " + r.status + ": " + ((err.error && err.error.message) || r.statusText));
    }

    const data = await r.json();
    const raw  = (data.candidates && data.candidates[0] && data.candidates[0].content &&
                  data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
                  data.candidates[0].content.parts[0].text) || "";
    const clean = raw.replace(/```json|```/g, "").trim();

    let mapped;
    try { mapped = JSON.parse(clean); }
    catch(e) { throw new Error("Gemini returned invalid JSON: " + clean.substring(0, 80)); }

    const fills = mapped.filter(function(x) {
      return x.v !== null && x.v !== undefined && String(x.v).trim() !== "";
    });

    log("Got " + fills.length + " values. Filling page...", "b");

    const injectRes = await chrome.scripting.executeScript({
      target: { tabId },
      func: function(fillData) {
        var results = [];
        var els = Array.from(document.querySelectorAll(
          'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),textarea,select'
        )).filter(function(el) {
          var cs = window.getComputedStyle(el);
          if (cs.display==="none" || cs.visibility==="hidden" || cs.opacity==="0") return false;
          var rect = el.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
        });

        fillData.forEach(function(item) {
          var el = els[item.i];
          if (!el) { results.push({ i: item.i, ok: false }); return; }
          try {
            if (el.tagName === "SELECT") {
              var lv = String(item.v).toLowerCase();
              var opt = Array.from(el.options).find(function(o) {
                return o.text.toLowerCase().includes(lv) || o.value.toLowerCase().includes(lv);
              });
              if (opt) { el.value = opt.value; el.dispatchEvent(new Event("change",{bubbles:true})); }
            } else if (el.type==="checkbox" || el.type==="radio") {
              var yes = ["true","yes","1"].includes(String(item.v).toLowerCase());
              if (el.checked !== yes) el.click();
            } else {
              el.focus();
              var proto = el.tagName==="TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              var setter = Object.getOwnPropertyDescriptor(proto, "value") && Object.getOwnPropertyDescriptor(proto, "value").set;
              if (setter) setter.call(el, item.v); else el.value = item.v;
              el.dispatchEvent(new InputEvent("input",  { bubbles:true, data: item.v }));
              el.dispatchEvent(new Event("change", { bubbles:true }));
              el.dispatchEvent(new Event("blur",   { bubbles:true }));
              el.blur();
            }
            results.push({ i: item.i, ok: true });
          } catch(e) {
            results.push({ i: item.i, ok: false });
          }
        });
        return results;
      },
      args: [fills]
    });

    const results = (injectRes && injectRes[0] && injectRes[0].result) ? injectRes[0].result : [];
    const nOk   = results.filter(function(r) { return r.ok; }).length;
    const nSkip = fields.length - nOk;

    document.getElementById("sFilled").textContent = nOk;
    document.getElementById("sSkip").textContent   = nSkip;

    fills.forEach(function(item) {
      const el = document.getElementById("fv-" + item.i);
      if (el) { el.textContent = item.v; el.className = "fv"; }
    });

    log("Done! " + nOk + " filled, " + nSkip + " skipped.", "g");
    toast(nOk + " fields filled!");

  } catch(e) {
    log("Error: " + e.message, "r");
    toast("Error: " + e.message.substring(0, 45), true);
  } finally {
    document.getElementById("btnFill").disabled = false;
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────
function buildProfileForm() {
  const c = document.getElementById("pform");
  SCHEMA.forEach(function(f) {
    const row = document.createElement("div");
    row.className = "row";
    const lbl = document.createElement("label");
    lbl.textContent = f.l;
    const inp = f.big ? document.createElement("textarea") : document.createElement("input");
    inp.id = "pf_" + f.k;
    if (!f.big) inp.type = "text";
    if (f.hint) inp.placeholder = f.hint;
    row.appendChild(lbl);
    row.appendChild(inp);
    c.appendChild(row);
  });
}

async function saveProfile() {
  const p = {};
  SCHEMA.forEach(function(f) {
    const el = document.getElementById("pf_" + f.k);
    p[f.k] = el ? el.value.trim() : "";
  });
  await chrome.storage.local.set({ profile: p });
  toast("Profile saved!");
  log("Profile saved.", "g");
}

async function saveKey() {
  const v = document.getElementById("apiKeyIn").value.trim();
  if (!v) { toast("Enter a key first", true); return; }
  await chrome.storage.local.set({ apiKey: v });
  toast("Key saved!");
  log("API key saved.", "g");
}

async function loadStored() {
  const data = await chrome.storage.local.get(["profile", "apiKey"]);
  if (data.profile) {
    SCHEMA.forEach(function(f) {
      const el = document.getElementById("pf_" + f.k);
      if (el && data.profile[f.k]) el.value = data.profile[f.k];
    });
  }
  if (data.apiKey) document.getElementById("apiKeyIn").value = data.apiKey;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg, cls) {
  const b = document.getElementById("logbox");
  const d = document.createElement("div");
  d.className = cls || "x";
  d.textContent = msg;
  b.appendChild(d);
  b.scrollTop = b.scrollHeight;
}

function toast(msg, bad) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "show" + (bad ? " bad" : "");
  setTimeout(function() { el.className = ""; }, 2800);
}
