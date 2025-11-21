(() => {
  "use strict";

  const CONFIG = window.APP_CONFIG || {};
  const TEXT = CONFIG.texts || {};
  const STORAGE_KEY = CONFIG.storageKey || "comptaLocaleTemplate";
  const PRINT_JOURNAL_CLASS = "print-planning";
  const PRINT_PIECES_CLASS = "print-fuel";
  const PRINT_DOC_CLASS = "print-document";

  const imageLimits = {
    ticketMaxDimension: CONFIG.images?.ticketMaxDimension ?? 1600,
    ticketMaxBytes: CONFIG.images?.ticketMaxBytes ?? 700 * 1024,
    signatureMaxDimension: CONFIG.images?.signatureMaxDimension ?? 1000,
    signatureMaxBytes: CONFIG.images?.signatureMaxBytes ?? 450 * 1024,
  };

  const DEFAULT_MICRO_ACTIVITIES = [
    { value: "ventes", label: "Ventes / commerce", rate: 12.8 },
    { value: "bic", label: "Prestations artisanales (BIC)", rate: 21.2 },
    { value: "liberal", label: "Libéral / BNC", rate: 22 },
  ];

  let state;
  let storageErrorNotified = false;

  // -----------------------------
  // Helpers
  // -----------------------------
  function resolvePath(base, path) {
    if (!path) return undefined;
    return path.split(".").reduce((acc, key) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, key)) {
        return acc[key];
      }
      return undefined;
    }, base);
  }

  function getText(key, fallback = "") {
    const value = resolvePath(TEXT, key);
    return typeof value === "string" && value.trim() ? value : fallback;
  }

  function formatTemplate(template, replacements) {
    if (typeof template !== "string") return "";
    return template.replace(/\{(.*?)\}/g, (_, token) => replacements[token] ?? "");
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now().toString(16)}-${Math.floor(Math.random() * 10000)}`;
  }

  function parseNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function mergeUnique(baseList = [], extraList = []) {
    const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
    const baseArr = toArray(baseList);
    const extraArr = toArray(extraList);
    const set = new Set();
    baseArr.forEach((item) => item && set.add(item));
    extraArr.forEach((item) => item && set.add(item));
    return Array.from(set);
  }

  function formatCurrency(value) {
    const currency = state?.meta?.currency || CONFIG.accounting?.currency || "EUR";
    const number = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(number);
  }

  function formatDateFr(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatDateNumeric(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(date);
  }

  function formatDateKey(date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(value) {
    const parts = (value || "").split("-");
    if (parts.length !== 3) return null;
    const [y, m, d] = parts.map((v) => Number(v));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function getIsoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.floor(((d - yearStart) / 86400000 + 1) / 7) + 1;
  }

  function isPaid(status) {
    if (!status) return true;
    const value = String(status).toLowerCase();
    return value.includes("pay") || value === "enregistré";
  }

  function setImageSource(id, src, altText) {
    const element = document.getElementById(id);
    if (element && src) {
      element.src = src;
      if (altText) element.alt = altText;
    }
  }

  // -----------------------------
  // State & defaults
  // -----------------------------
  const defaultEntry = (type = "income") => ({
    id: uuid(),
    type,
    date: "",
    reference: "",
    docId: "",
    contactId: "",
    fallbackContact: "",
    microActivity: "",
    category:
      type === "income"
        ? CONFIG.accounting?.incomeCategories?.[0] || "Autre recette"
        : CONFIG.accounting?.expenseCategories?.[0] || "Autre dépense",
    amountHT: 0,
    tvaRate: CONFIG.accounting?.tvaRates?.[0] ?? 0,
    amountTTC: 0,
    paymentMethod: CONFIG.accounting?.paymentMethods?.[0] || "",
    status: CONFIG.accounting?.statuses?.[0] || "enregistré",
    pieceId: "",
    notes: "",
  });

  const defaultContact = (type = "client") => ({
    id: uuid(),
    type,
    name: "",
    email: "",
    phone: "",
    siret: "",
    address: "",
    zip: "",
    city: "",
    notes: "",
  });

  const defaultPiece = () => ({
    id: uuid(),
    date: "",
    reference: "",
    amount: "",
    linkedEntry: "",
    notes: "",
    image: "",
  });

  const defaultDocLine = () => ({
    id: uuid(),
    description: "",
    qty: 1,
    unit: 0,
    tva: CONFIG.accounting?.tvaRates?.[0] ?? 0,
  });

  const defaultDocument = () => ({
    id: uuid(),
    type: "devis",
    number: "",
    date: "",
    due: "",
    clientId: "",
    clientFree: "",
    microActivity: "liberal",
    status: CONFIG.accounting?.statuses?.[0] || "enregistré",
    paymentMethod: CONFIG.accounting?.paymentMethods?.[0] || "",
    depositPercent: 0,
    depositPaid: 0,
    notes: "",
    lines: [defaultDocLine()],
  });

  const defaultCompany = () => ({
    legalName: "",
    status: "",
    siren: "",
    vat: "",
    phone: "",
    email: "",
    address: "",
    logo: "",
    microTvaExempt: false,
    iban: "",
  });

  const defaultState = () => ({
    meta: {
      company: "",
      dossierTitle: "Comptabilité locale",
      periodStart: "",
      periodEnd: "",
      currency: CONFIG.accounting?.currency || "EUR",
      observations: "",
      incomeCategories: [...(CONFIG.accounting?.incomeCategories || [])],
      expenseCategories: [...(CONFIG.accounting?.expenseCategories || [])],
      paymentMethods: [...(CONFIG.accounting?.paymentMethods || [])],
      microTurnover: 0,
    },
    company: defaultCompany(),
    entries: [],
    contacts: {
      clients: [],
      fournisseurs: [],
    },
    pieces: [],
    documents: [],
    microPayments: [],
    signature: "",
  });

  state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      const normalizeDoc = (doc) => ({
        ...defaultDocument(),
        ...doc,
        lines: Array.isArray(doc?.lines)
          ? doc.lines.map((line) => ({ ...defaultDocLine(), ...line }))
          : [defaultDocLine()],
      });
      return {
        ...base,
        ...parsed,
        meta: {
          ...base.meta,
          ...(parsed.meta || {}),
          incomeCategories: mergeUnique(base.meta.incomeCategories, parsed.meta?.incomeCategories),
          expenseCategories: mergeUnique(base.meta.expenseCategories, parsed.meta?.expenseCategories),
          paymentMethods: mergeUnique(base.meta.paymentMethods, parsed.meta?.paymentMethods),
        },
        company: { ...base.company, ...(parsed.company || {}) },
        entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : [],
        contacts: {
          clients: Array.isArray(parsed.contacts?.clients)
            ? parsed.contacts.clients.map((c) => normalizeContact(c, "client"))
            : [],
          fournisseurs: Array.isArray(parsed.contacts?.fournisseurs)
            ? parsed.contacts.fournisseurs.map((c) => normalizeContact(c, "fournisseur"))
            : [],
        },
        pieces: Array.isArray(parsed.pieces) ? parsed.pieces.map(normalizePiece) : [],
        documents: Array.isArray(parsed.documents) ? parsed.documents.map(normalizeDoc) : [],
        microPayments: Array.isArray(parsed.microPayments)
          ? parsed.microPayments.map((p) => ({
              id: p.id || uuid(),
              date: p.date || "",
              amount: parseNumber(p.amount),
              notes: p.notes || "",
              entryId: p.entryId || "",
            }))
          : [],
        signature: parsed.signature || "",
      };
    } catch (error) {
      console.warn("Impossible de charger les données, utilisation des valeurs par défaut.", error);
      return defaultState();
    }
  }

  function normalizeEntry(entry) {
    if (!entry) return defaultEntry();
    const type = entry.type === "expense" ? "expense" : "income";
    return {
      ...defaultEntry(type),
      ...entry,
      type,
      docId: entry.docId || "",
      microActivity: entry.microActivity || "",
      date: entry.date || "",
      amountHT: parseNumber(entry.amountHT),
      amountTTC: parseNumber(entry.amountTTC),
      tvaRate: parseNumber(entry.tvaRate),
    };
  }

  function normalizeContact(contact, type = "client") {
    if (!contact) return defaultContact(type);
    const finalType = contact.type === "fournisseur" ? "fournisseur" : "client";
    return {
      ...defaultContact(finalType),
      ...contact,
      type: finalType,
      siret: contact.siret || "",
      address: contact.address || "",
      zip: contact.zip || "",
      city: contact.city || "",
    };
  }

  function normalizePiece(piece) {
    if (!piece) return defaultPiece();
    return { ...defaultPiece(), ...piece, amount: piece.amount ? parseNumber(piece.amount) : "" };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageErrorNotified = false;
    } catch (error) {
      console.warn("Impossible d'enregistrer les données localement.", error);
      if (!storageErrorNotified) {
        alert(
          getText(
            "alerts.storageError",
            "Le stockage local a échoué (données trop volumineuses). Réduisez la taille des images ou supprimez-en quelques-unes."
          )
        );
        storageErrorNotified = true;
      }
    } finally {
      renderAll();
    }
  }

  function resetState() {
    state = defaultState();
    saveState();
    populateForms();
  }

  // -----------------------------
  // Branding & textes
  // -----------------------------
  function applyThemeColors() {
    const colors = CONFIG.theme?.colors || {};
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      if (!value) return;
      root.style.setProperty(`--color-${key.toLowerCase()}`, value);
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && CONFIG.theme?.metaThemeColor) {
      meta.setAttribute("content", CONFIG.theme.metaThemeColor);
    }
  }

  function applyBranding() {
    if (CONFIG.appName) {
      document.title = CONFIG.appName;
    }
    const tagline = document.getElementById("app-tagline");
    if (tagline) {
      tagline.textContent = getText(
        "header.tagline",
        "Pensé pour les micro-entreprises : saisie rapide, stockage local, exports et impressions prêts pour vos obligations."
      );
    }
    const summary = document.getElementById("week-summary");
    if (summary) {
      summary.textContent = getText("header.summaryPlaceholder", "Période active : du - au - — -");
    }
    const branding = CONFIG.branding || {};
    setImageSource("brand-logo", branding.employerLogoSrc, branding.employerLogoAlt);
    const journalLogoSrc =
      state.company?.logo || branding.previewLogoSrc || branding.employerLogoSrc || branding.footerLogoSrc;
    if (journalLogoSrc) {
      setImageSource("logo-preview", journalLogoSrc, branding.employerLogoAlt);
    }
    const footerText = document.getElementById("footer-text");
    if (footerText && branding.footerText) {
      footerText.textContent = branding.footerText;
    }
    const footerLogoSrc = branding.footerLogoSrc || branding.employerLogoSrc || "logoOfficielRMS.svg";
    setImageSource("footer-logo", footerLogoSrc, branding.footerLogoAlt);
    applyButtonLabels();
    updateFooterYear();
  }

  function applyButtonLabels() {
    const saveLabel = getText("buttons.save", "Exporter en JSON");
    const loadLabel = getText("buttons.load", "Importer un dossier");
    document.querySelectorAll(".btn-save").forEach((btn) => (btn.textContent = saveLabel));
    document.querySelectorAll(".btn-load").forEach((btn) => (btn.textContent = loadLabel));
  }

  function updateFooterYear() {
    const yearSpan = document.getElementById("footer-year");
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }
  }

  function applyTextPlaceholders() {
    document.querySelectorAll("[data-text-key]").forEach((node) => {
      const value = getText(node.dataset.textKey, node.textContent);
      if (value) node.textContent = value;
    });
    document.querySelectorAll("[data-rich-text-key]").forEach((node) => {
      const value = getText(node.dataset.richTextKey, node.innerHTML);
      if (value) node.innerHTML = value;
    });
  }

  function renderInstructionSections() {
    const usageIntro = document.getElementById("usage-intro");
    if (usageIntro) usageIntro.textContent = getText("usage.intro", usageIntro.textContent);
    const usageList = document.getElementById("usage-list");
    if (usageList) {
      const steps = Array.isArray(TEXT.usage?.steps) ? TEXT.usage.steps : [];
      usageList.innerHTML = steps
        .map((step) => `<li><strong>${step.title}</strong> : ${step.description}</li>`)
        .join("");
    }
    const fileIntro = document.getElementById("file-org-intro");
    if (fileIntro) fileIntro.textContent = getText("fileOrganization.intro", fileIntro.textContent);
    const stepsList = document.getElementById("file-org-steps");
    if (stepsList) {
      const orgSteps = Array.isArray(TEXT.fileOrganization?.steps) ? TEXT.fileOrganization.steps : [];
      stepsList.innerHTML = orgSteps.map((step) => `<li>${step}</li>`).join("");
    }
    const reminder = document.getElementById("file-reminder-text");
    if (reminder) reminder.textContent = getText("fileOrganization.reminder", reminder.textContent);
  }

  // -----------------------------
  // Populate forms
  // -----------------------------
  function populateForms() {
    document.getElementById("company-name").value = state.meta.company;
    document.getElementById("dossier-title").value = state.meta.dossierTitle;
    document.getElementById("period-start").value = state.meta.periodStart;
    document.getElementById("period-end").value = state.meta.periodEnd;
    document.getElementById("currency").value = state.meta.currency;
    document.getElementById("observations").value = state.meta.observations;
    populateCompanyForm();
    fillAccountingSelectors();
    populateContactSelects();
    renderAll();
  }

  function populateCompanyForm() {
    const c = state.company || defaultCompany();
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || "";
    };
    set("company-legal-name", c.legalName);
    set("company-status", c.status);
    set("company-siren", c.siren);
    set("company-vat", c.vat);
    set("company-phone", c.phone);
    set("company-email", c.email);
    set("company-iban", c.iban);
    const addr = document.getElementById("company-address");
    if (addr) addr.value = c.address || "";
    const microExempt = document.getElementById("company-micro-exempt");
    if (microExempt) microExempt.checked = !!c.microTvaExempt;
    const preview = document.getElementById("company-logo-preview");
    if (preview) {
      if (c.logo) {
        preview.src = c.logo;
        preview.style.display = "block";
      } else {
        preview.removeAttribute("src");
        preview.style.display = "none";
      }
    }
    const journalLogo = document.getElementById("logo-preview");
    if (journalLogo) {
      if (c.logo) {
        journalLogo.src = c.logo;
        journalLogo.style.display = "block";
      } else if (!CONFIG.branding?.previewLogoSrc && !CONFIG.branding?.employerLogoSrc) {
        journalLogo.removeAttribute("src");
        journalLogo.style.display = "none";
      }
    }
  }

  function handleCompanyInput(event) {
    const { id, value } = event.target;
    if (id === "company-legal-name") state.company.legalName = value;
    if (id === "company-status") state.company.status = value;
    if (id === "company-siren") state.company.siren = value;
    if (id === "company-vat") state.company.vat = value;
    if (id === "company-phone") state.company.phone = value;
    if (id === "company-email") state.company.email = value;
    if (id === "company-iban") state.company.iban = value;
    if (id === "company-address") state.company.address = value;
    if (id === "company-micro-exempt") {
      state.company.microTvaExempt = event.target.checked;
      toggleDocMicroMention();
    }
    saveState();
  }
  function handleCompanyLogo(event) {
    const file = event.target.files?.[0];
    if (!file) {
      state.company.logo = "";
      saveState();
      populateCompanyForm();
      return;
    }
    readFileAsDataURL(file).then(async (dataUrl) => {
      const optimized = await optimizeTicketImageDataUrl(dataUrl);
      state.company.logo = optimized || dataUrl;
      saveState();
      populateCompanyForm();
    });
  }

  // -----------------------------
  // Selectors & categories
  // -----------------------------
  function fillAccountingSelectors() {
    const tvaRates = Array.isArray(CONFIG.accounting?.tvaRates)
      ? CONFIG.accounting.tvaRates
      : [0, 5.5, 10, 20];
    const incomeCats = getIncomeCategories();
    const expenseCats = getExpenseCategories();
    const methods = state.meta.paymentMethods || CONFIG.accounting?.paymentMethods || [];

    document.querySelectorAll('[data-field="tvaRate"]').forEach((select) => {
      const current = select.value;
      select.innerHTML = "";
      tvaRates.forEach((rate) => {
        const option = document.createElement("option");
        option.value = rate;
        option.textContent = `${rate}%`;
        select.appendChild(option);
      });
      select.value = current || "";
    });

    const statuses = CONFIG.accounting?.statuses || ["enregistré", "payé"];
    document.querySelectorAll('[data-field="status"]').forEach((select) => {
      const current = select.value;
      select.innerHTML = "";
      statuses.forEach((status) => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        select.appendChild(option);
      });
      select.value = current || statuses[0];
    });

    document.querySelectorAll('[data-field="paymentMethod"]').forEach((select) => {
      const current = select.value;
      select.innerHTML = "";
      methods.forEach((method) => {
        const option = document.createElement("option");
        option.value = method;
        option.textContent = method;
        select.appendChild(option);
      });
      select.value = current || methods[0];
    });

    document
      .querySelectorAll('#income-form [data-field="category"]')
      .forEach((select) => fillCategories(select, incomeCats));
    document
      .querySelectorAll('#expense-form [data-field="category"]')
      .forEach((select) => fillCategories(select, expenseCats));
    fillPaymentManagerSelect("income-payment-manage", methods);
    fillPaymentManagerSelect("expense-payment-manage", methods);

    const incomeActivity = document.getElementById("income-activity-select");
    if (incomeActivity) {
      const current = incomeActivity.value;
      incomeActivity.innerHTML = "";
      getMicroActivities().forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        incomeActivity.appendChild(option);
      });
      incomeActivity.value = current || "liberal";
    }

    const docPayment = document.getElementById("doc-payment");
    if (docPayment) {
      const current = docPayment.value;
      docPayment.innerHTML = "";
      methods.forEach((method) => {
        const option = document.createElement("option");
        option.value = method;
        option.textContent = method;
        docPayment.appendChild(option);
      });
      docPayment.value = current || methods[0] || "";
    }

    const docStatus = document.getElementById("doc-status");
    if (docStatus) {
      const current = docStatus.value;
      docStatus.innerHTML = "";
      statuses.forEach((status) => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        docStatus.appendChild(option);
      });
      docStatus.value = current || statuses[0] || "";
    }

    const docActivity = document.getElementById("doc-activity");
    if (docActivity) {
      const current = docActivity.value;
      docActivity.innerHTML = "";
      getMicroActivities().forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        docActivity.appendChild(option);
      });
      docActivity.value = current || "liberal";
    }
    fillCategoryManagerSelect("income-category-manage", incomeCats);
    fillCategoryManagerSelect("expense-category-manage", expenseCats);
  }

  function fillCategories(select, categories = []) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "-- Choisir une catégorie --";
    select.appendChild(option);
    const source = Array.isArray(categories) ? categories : [];
    source.forEach((category) => {
      const opt = document.createElement("option");
      opt.value = category;
      opt.textContent = category;
      select.appendChild(opt);
    });
    if (current && source.includes(current)) {
      select.value = current;
    }
  }

  function fillCategoryManagerSelect(selectId, categories = []) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Choisir une catégorie --";
    select.appendChild(placeholder);
    categories.forEach((category) => {
      const opt = document.createElement("option");
      opt.value = category;
      opt.textContent = category;
      select.appendChild(opt);
    });
    if (current && categories.includes(current)) {
      select.value = current;
    }
  }

  function fillPaymentManagerSelect(selectId, methods = []) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Choisir un moyen --";
    select.appendChild(placeholder);
    methods.forEach((method) => {
      const opt = document.createElement("option");
      opt.value = method;
      opt.textContent = method;
      select.appendChild(opt);
    });
    if (current && methods.includes(current)) {
      select.value = current;
    }
  }

  function getIncomeCategories() {
    const base = Array.isArray(CONFIG.accounting?.incomeCategories)
      ? CONFIG.accounting.incomeCategories
      : [];
    let merged = mergeUnique(base, state.meta.incomeCategories);
    if (!merged.length) merged = ["Ventes produits", "Prestations de services", "Autre recette"];
    state.meta.incomeCategories = merged;
    return merged;
  }

  function getExpenseCategories() {
    const base = Array.isArray(CONFIG.accounting?.expenseCategories)
      ? CONFIG.accounting.expenseCategories
      : [];
    let merged = mergeUnique(base, state.meta.expenseCategories);
    if (!merged.length) merged = ["Charges externes", "Investissements & matériel", "Autre dépense"];
    state.meta.expenseCategories = merged;
    return merged;
  }

  function addExpenseCategory(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    state.meta.expenseCategories = mergeUnique(state.meta.expenseCategories, [trimmed]);
    fillAccountingSelectors();
    saveState();
  }

  function addIncomeCategory(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    state.meta.incomeCategories = mergeUnique(state.meta.incomeCategories, [trimmed]);
    fillAccountingSelectors();
    saveState();
  }

  function removeCategoryFromEntries(type, category) {
    if (!category) return;
    state.entries = state.entries.map((entry) => {
      if (entry.type === type && entry.category === category) {
        return { ...entry, category: "" };
      }
      return entry;
    });
  }

  function removeExpenseCategory(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    const inUse = state.entries.some((entry) => entry.type === "expense" && entry.category === trimmed);
    const shouldDelete = confirm(
      inUse
        ? `La catégorie "${trimmed}" est utilisée dans vos dépenses. La supprimer ? Les lignes liées seront vidées.`
        : `Supprimer la catégorie "${trimmed}" ?`
    );
    if (!shouldDelete) return;
    state.meta.expenseCategories = (state.meta.expenseCategories || []).filter((cat) => cat !== trimmed);
    removeCategoryFromEntries("expense", trimmed);
    fillAccountingSelectors();
    saveState();
  }

  function removeIncomeCategory(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    const inUse = state.entries.some((entry) => entry.type === "income" && entry.category === trimmed);
    const shouldDelete = confirm(
      inUse
        ? `La catégorie "${trimmed}" est utilisée dans vos recettes. La supprimer ? Les lignes liées seront vidées.`
        : `Supprimer la catégorie "${trimmed}" ?`
    );
    if (!shouldDelete) return;
    state.meta.incomeCategories = (state.meta.incomeCategories || []).filter((cat) => cat !== trimmed);
    removeCategoryFromEntries("income", trimmed);
    fillAccountingSelectors();
    saveState();
  }

  function addPaymentMethod(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    if (!state.meta.paymentMethods.includes(trimmed)) {
      state.meta.paymentMethods.push(trimmed);
      fillAccountingSelectors();
      saveState();
    }
  }

  function removePaymentMethod(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    const inUse = state.entries.some((entry) => entry.paymentMethod === trimmed);
    const shouldDelete = confirm(
      inUse
        ? `Le moyen de paiement "${trimmed}" est utilisé dans vos enregistrements. Le supprimer ? Les lignes liées seront vidées.`
        : `Supprimer le moyen de paiement "${trimmed}" ?`
    );
    if (!shouldDelete) return;
    state.meta.paymentMethods = (state.meta.paymentMethods || []).filter((method) => method !== trimmed);
    state.entries = state.entries.map((entry) =>
      entry.paymentMethod === trimmed ? { ...entry, paymentMethod: "" } : entry
    );
    fillAccountingSelectors();
    saveState();
  }

  // -----------------------------
  // Entries
  // -----------------------------
  function handleEntryFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const type = form.dataset.entryType === "expense" ? "expense" : "income";
    const entry = normalizeEntry(readEntryForm(form, type));
    const existingIndex = state.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
      state.entries[existingIndex] = entry;
    } else {
      state.entries.push(entry);
    }
    clearEntryForm(form);
    saveState();
  }

  function readEntryForm(form, type) {
    const entryId = form.dataset.editingId || uuid();
    const getField = (name) => form.querySelector(`[data-field="${name}"]`);
    const amountHT = parseNumber(getField("amountHT")?.value);
    const tvaRate = parseNumber(getField("tvaRate")?.value);
    const explicitTtc = parseNumber(getField("amountTTC")?.value);
    const ttc = amountHT > 0 ? amountHT * (1 + tvaRate / 100) : explicitTtc;
    const contactId = getField("contactId")?.value || "";
    const fallbackContact = getField("fallbackContact")?.value || "";
    return {
      id: entryId,
      type,
      date: getField("date")?.value || "",
      reference: getField("reference")?.value || "",
      contactId,
      fallbackContact,
      category: getField("category")?.value || "",
      microActivity: getField("microActivity")?.value || "liberal",
      amountHT,
      tvaRate,
      amountTTC: ttc,
      paymentMethod: getField("paymentMethod")?.value || "",
      status: getField("status")?.value || "",
      pieceId: getField("pieceId")?.value || "",
      notes: getField("notes")?.value || "",
    };
  }

  function clearEntryForm(form) {
    form.reset();
    form.dataset.editingId = "";
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.textContent = form.dataset.entryType === "expense" ? "Ajouter la dépense" : "Ajouter la recette";
    }
  }

  function populateEntryForm(form, entry) {
    if (!form || !entry) return;
    form.dataset.editingId = entry.id;
    const set = (name, value) => {
      const field = form.querySelector(`[data-field="${name}"]`);
      if (field) field.value = value ?? "";
    };
    set("date", entry.date);
    set("reference", entry.reference);
    set("contactId", entry.contactId);
    set("fallbackContact", entry.fallbackContact);
    set("category", entry.category);
    set("microActivity", entry.microActivity || "liberal");
    set("amountHT", entry.amountHT);
    set("tvaRate", entry.tvaRate);
    set("amountTTC", entry.amountTTC);
    set("paymentMethod", entry.paymentMethod);
    set("status", entry.status);
    set("pieceId", entry.pieceId);
    set("notes", entry.notes);
  }

  function renderEntryTables() {
    renderEntryTable("income", document.getElementById("income-table-body"));
    renderEntryTable("expense", document.getElementById("expense-table-body"));
  }

  function renderEntryTable(type, tbody) {
    if (!tbody) return;
    const entries = state.entries.filter((entry) => entry.type === type).sort(sortByDate);
    tbody.innerHTML = entries
      .map((entry) => {
        const { tvaAmount, amountTTC } = computeEntryAmounts(entry);
        return `
          <tr data-entry-id="${entry.id}">
            <td>${formatDateNumeric(entry.date)}</td>
            <td>${entry.reference || "-"}</td>
            <td>${getEntryContactLabel(entry)}</td>
            <td>${entry.category || "-"}</td>
            <td>${formatCurrency(entry.amountHT)}</td>
            <td>${formatCurrency(tvaAmount)}</td>
            <td>${formatCurrency(amountTTC)}</td>
            <td>${entry.paymentMethod || "-"}</td>
            <td>${entry.status || "-"}</td>
            <td>
              <button class="table-link" data-action="edit" data-entry-type="${type}">Éditer</button>
              <button class="table-link danger" data-action="delete" data-entry-type="${type}">Supprimer</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function sortByDate(a, b) {
    return new Date(a.date || 0) - new Date(b.date || 0);
  }

  function getEntryContactLabel(entry) {
    if (entry.contactId) {
      const pool = entry.type === "income" ? state.contacts.clients : state.contacts.fournisseurs;
      const found = pool.find((c) => c.id === entry.contactId);
      if (found) return found.name;
    }
    return entry.fallbackContact || "-";
  }

  function computeEntryAmounts(entry) {
    const ht = parseNumber(entry.amountHT);
    const rate = parseNumber(entry.tvaRate);
    let tvaAmount = 0;
    let amountTTC = parseNumber(entry.amountTTC);
    if (ht > 0) {
      tvaAmount = ht * (rate / 100);
      amountTTC = ht + tvaAmount;
    } else if (amountTTC > 0) {
      const divisor = 1 + rate / 100;
      const computedHt = divisor ? amountTTC / divisor : amountTTC;
      tvaAmount = amountTTC - computedHt;
    }
    return { tvaAmount, amountTTC };
  }

  // -----------------------------
  // Contacts
  // -----------------------------
  function handleContactSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const type = form.dataset.contactType === "fournisseur" ? "fournisseur" : "client";
    const contact = {
      ...defaultContact(type),
      name: form.querySelector('[data-contact-field="name"]')?.value || "",
      email: form.querySelector('[data-contact-field="email"]')?.value || "",
      phone: form.querySelector('[data-contact-field="phone"]')?.value || "",
      siret: form.querySelector('[data-contact-field="siret"]')?.value || "",
      address: form.querySelector('[data-contact-field="address"]')?.value || "",
      zip: form.querySelector('[data-contact-field="zip"]')?.value || "",
      city: form.querySelector('[data-contact-field="city"]')?.value || "",
      notes: form.querySelector('[data-contact-field="notes"]')?.value || "",
    };
    const listKey = type === "fournisseur" ? "fournisseurs" : "clients";
    state.contacts[listKey].push(contact);
    form.reset();
    saveState();
  }

  function renderContactLists() {
    renderContactList("client", document.getElementById("client-list"));
    renderContactList("fournisseur", document.getElementById("fournisseur-list"));
    populateContactSelects();
  }

  function renderContactList(type, container) {
    if (!container) return;
    const listKey = type === "fournisseur" ? "fournisseurs" : "clients";
    const contacts = state.contacts[listKey] || [];
    container.innerHTML = contacts
      .map(
        (contact) => `
        <div class="contact-card" data-contact-id="${contact.id}" data-contact-type="${type}">
          <div>
            <strong>${contact.name}</strong>
            <p>${contact.email || ""}</p>
            <p>${contact.phone || ""}</p>
            <p>${contact.siret || ""}</p>
            <p>${contact.address || ""} ${contact.zip || ""} ${contact.city || ""}</p>
            <p>${contact.notes || ""}</p>
          </div>
          <button class="table-link danger" data-action="delete-contact">Supprimer</button>
        </div>
      `
      )
      .join("");
  }

  function handleContactListClick(event) {
    const action = event.target.dataset.action;
    if (action !== "delete-contact") return;
    const card = event.target.closest(".contact-card");
    if (!card) return;
    const contactId = card.dataset.contactId;
    const type = card.dataset.contactType === "fournisseur" ? "fournisseurs" : "clients";
    state.contacts[type] = state.contacts[type].filter((c) => c.id !== contactId);
    saveState();
  }

  function populateContactSelects() {
    const clientSelect = document.querySelector('#income-form [data-field="contactId"]');
    const fournisseurSelect = document.querySelector('#expense-form [data-field="contactId"]');
    const docClientSelect = document.getElementById("doc-client");
    fillContactSelect(clientSelect, state.contacts.clients);
    fillContactSelect(fournisseurSelect, state.contacts.fournisseurs);
    fillContactSelect(docClientSelect, state.contacts.clients);
  }

  function fillContactSelect(select, contacts) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Saisir manuellement</option>';
    contacts.forEach((contact) => {
      const option = document.createElement("option");
      option.value = contact.id;
      option.textContent = contact.name;
      select.appendChild(option);
    });
    select.value = current || "";
  }

  function getAllContacts() {
    return [...(state.contacts.clients || []), ...(state.contacts.fournisseurs || [])];
  }

  const QUICK_PRESETS = {
    callback: (ctx) => `Bonjour ${ctx.name || ""}, je vous rappelle dès que possible.`,
    first: (ctx) => `Bonjour ${ctx.name || ""}, suite à votre demande, je reviens vers vous pour échanger.`,
    quote: (ctx) => `Bonjour ${ctx.name || ""}, avez-vous eu le temps de consulter le devis ? Je reste disponible.`,
    thankyou: (ctx) => `Bonjour ${ctx.name || ""}, merci pour votre confiance. N'hésitez pas si besoin.`,
    "rdv-confirm": (ctx) =>
      ctx.rdvText
        ? `Bonjour ${ctx.name || ""}, je confirme notre rendez-vous ${ctx.rdvText}.`
        : `Bonjour ${ctx.name || ""}, je confirme notre rendez-vous.`,
    "rdv-reminder": (ctx) =>
      ctx.rdvText
        ? `Bonjour ${ctx.name || ""}, petit rappel de notre rendez-vous ${ctx.rdvText}.`
        : `Bonjour ${ctx.name || ""}, je vous rappelle notre rendez-vous.`,
  };

  function getLatestAppointment(contactId) {
    if (!contactId) return null;
    const calendarRaw = localStorage.getItem("comptaCalendar");
    let events = [];
    try {
      events = calendarRaw ? JSON.parse(calendarRaw) : [];
    } catch (e) {
      events = [];
    }
    const fichesRaw = localStorage.getItem("comptaFiches");
    try {
      const fiches = fichesRaw ? JSON.parse(fichesRaw) : [];
      fiches
        .filter((f) => f.clientId === contactId)
        .forEach((f) =>
          events.push({
            date: f.date,
            start: f.time,
            title: f.title || "Rendez-vous",
            notes: f.notes,
            clientId: f.clientId,
          })
        );
    } catch (e) {
      /* noop */
    }
    const withDate = events.filter((e) => e.date);
    if (!withDate.length) return null;
    withDate.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    return withDate[withDate.length - 1];
  }

  function fmtRdvText(ev) {
    if (!ev?.date) return "";
    const date = new Date(ev.date);
    const day = date.toLocaleDateString("fr-FR");
    const time = ev.start ? ` à ${ev.start}` : "";
    return `prévu le ${day}${time}`;
  }

  function renderQuickCommPanel() {
    const select = document.getElementById("qc-contact");
    if (!select) return;
    const contacts = getAllContacts();
    const current = select.value;
    select.innerHTML = '<option value="">Sélectionner</option>';
    contacts.forEach((contact) => {
      const opt = document.createElement("option");
      opt.value = contact.id;
      opt.textContent = contact.name || "Contact";
      select.appendChild(opt);
    });
    select.value = current || "";
    updateQuickCommFields();
  }

  function getQuickContactById(id) {
    if (!id) return null;
    return getAllContacts().find((c) => c.id === id) || null;
  }

  function updateQuickCommFields() {
    const select = document.getElementById("qc-contact");
    const phoneInput = document.getElementById("qc-phone");
    const emailInput = document.getElementById("qc-email");
    const messageInput = document.getElementById("qc-message");
    const subjectInput = document.getElementById("qc-subject");
    const presetSelect = document.getElementById("qc-preset");
    const callLink = document.getElementById("qc-call");
    const smsLink = document.getElementById("qc-sms");
    const mailLink = document.getElementById("qc-mail");
    if (!select || !phoneInput || !emailInput || !messageInput || !subjectInput) return;
    const contact = getQuickContactById(select.value);
    const phone = (contact?.phone || phoneInput.value || "").trim();
    const email = (contact?.email || emailInput.value || "").trim();
    phoneInput.value = phone;
    emailInput.value = email;

    // Appliquer un modèle si choisi
    if (presetSelect && presetSelect.value) {
      const rdv = getLatestAppointment(contact?.id);
      const ctx = {
        name: contact?.name || "",
        rdvText: fmtRdvText(rdv),
      };
      const tpl = QUICK_PRESETS[presetSelect.value];
      if (tpl) {
        const text = tpl(ctx).trim();
        messageInput.value = text;
        if (presetSelect.value.includes("rdv") && !subjectInput.value) {
          subjectInput.value = "Rendez-vous";
        }
      }
    }

    const message = messageInput.value || "";
    const subject = subjectInput.value || "";
    if (callLink) {
      callLink.href = phone ? `tel:${phone}` : "#";
      callLink.setAttribute("aria-disabled", phone ? "false" : "true");
    }
    if (smsLink) {
      const body = encodeURIComponent(message);
      smsLink.href = phone ? `sms:${phone}?&body=${body}` : "#";
      smsLink.setAttribute("aria-disabled", phone ? "false" : "true");
    }
    if (mailLink) {
      const mailSubject = encodeURIComponent(subject);
      const mailBody = encodeURIComponent(message);
      mailLink.href = email ? `mailto:${email}?subject=${mailSubject}&body=${mailBody}` : "#";
      mailLink.setAttribute("aria-disabled", email ? "false" : "true");
    }
  }

  function setupQuickComm() {
    const btn = document.getElementById("quick-comm-btn");
    const panel = document.getElementById("quick-comm-panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
      panel.classList.toggle("open");
    });
    document.getElementById("qc-contact")?.addEventListener("change", updateQuickCommFields);
    ["qc-phone", "qc-email", "qc-message", "qc-subject", "qc-preset"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updateQuickCommFields);
    });
  }

  // -----------------------------
  // Pieces (images)
  // -----------------------------
  async function handlePieceSubmit(event) {
    event.preventDefault();
    const fileInput = document.getElementById("piece-image");
    const file = fileInput?.files?.[0];
    let image = "";
    if (file) {
      try {
        image = await prepareTicketImage(file);
        if (!image) {
          alert(getText("alerts.ticketTooLarge", "L'image de la pièce est trop volumineuse."));
          return;
        }
      } catch (error) {
        console.error("Impossible de traiter la pièce.", error);
        alert(getText("alerts.ticketProcessError", "La pièce justificative n'a pas pu être chargée."));
        return;
      }
    }

    const piece = {
      ...defaultPiece(),
      date: document.getElementById("piece-date")?.value || "",
      reference: document.getElementById("piece-ref")?.value || "",
      amount: parseNumber(document.getElementById("piece-amount")?.value),
      linkedEntry: document.getElementById("piece-linked-entry")?.value || "",
      notes: document.getElementById("piece-notes")?.value || "",
      image,
    };
    state.pieces.push(piece);
    document.getElementById("piece-form").reset();
    saveState();
  }

  function renderPieces() {
    const container = document.getElementById("piece-preview-grid");
    if (!container) return;
    const wrapper = document.getElementById("piece-preview-wrapper");
    const emptyText = "Pièce non fournie";
    container.innerHTML = state.pieces
      .map(
        (piece, index) => `
        <div class="fuel-preview-card" data-piece-id="${piece.id}">
          <strong>Pièce #${index + 1}</strong>
          <p>DT : ${formatDateNumeric(piece.date)}</p>
          <p>Réf. : ${piece.reference || "-"}</p>
          <p>Montant : ${piece.amount ? formatCurrency(piece.amount) : "-"}</p>
          <p>Écriture : ${piece.linkedEntry || "-"}</p>
          ${
            piece.image
              ? `<img src="${piece.image}" alt="Pièce ${index + 1}" />`
              : `<div class="empty-ticket">${emptyText}</div>`
          }
          <div class="preview-actions">
            <button class="table-link danger" data-action="delete-piece">Supprimer</button>
          </div>
        </div>
      `
      )
      .join("");
    if (wrapper) {
      const hasContent = state.pieces.length > 0;
      wrapper.hidden = !hasContent;
      syncPiecePreviewToggle(hasContent, !wrapper.hidden);
    }
  }

  function syncPiecePreviewToggle(hasContent, isVisible) {
    const toggle = document.getElementById("toggle-piece-preview");
    if (!toggle) return;
    toggle.textContent = isVisible ? "Masquer l'aperçu des pièces" : "Afficher l'aperçu des pièces";
    toggle.disabled = !hasContent;
  }

  function handlePieceActions(event) {
    const action = event.target.dataset.action;
    if (action !== "delete-piece") return;
    const card = event.target.closest("[data-piece-id]");
    if (!card) return;
    const pieceId = card.dataset.pieceId;
    state.pieces = state.pieces.filter((piece) => piece.id !== pieceId);
    saveState();
  }

  function setupPiecePreviewToggle() {
    const toggle = document.getElementById("toggle-piece-preview");
    const wrapper = document.getElementById("piece-preview-wrapper");
    if (!toggle || !wrapper) return;
    toggle.addEventListener("click", () => {
      if (toggle.disabled) return;
      const shouldShow = wrapper.hidden;
      wrapper.hidden = !shouldShow;
      syncPiecePreviewToggle(state.pieces.length > 0, shouldShow);
    });
    syncPiecePreviewToggle(state.pieces.length > 0, !wrapper.hidden);
  }

  // -----------------------------
  // Images helpers
  // -----------------------------
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function estimateDataUrlBytes(dataUrl) {
    const base64 = dataUrl.split(",")[1] || "";
    return Math.ceil((base64.length * 3) / 4);
  }

  async function prepareTicketImage(file) {
    const initialDataUrl = await readFileAsDataURL(file);
    return optimizeTicketImageDataUrl(initialDataUrl);
  }

  async function prepareSignatureImage(file) {
    const initialDataUrl = await readFileAsDataURL(file);
    return optimizeSignatureImageDataUrl(initialDataUrl);
  }

  async function optimizeTicketImageDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return "";
    if (!dataUrl.startsWith("data:image")) return dataUrl;
    try {
      const imageElement = await loadImage(dataUrl);
      return compressTicketImageElement(imageElement);
    } catch (error) {
      console.warn("Impossible de retraiter la photo de pièce.", error);
      return "";
    }
  }

  async function optimizeSignatureImageDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") return "";
    if (!dataUrl.startsWith("data:image")) return dataUrl;
    try {
      const imageElement = await loadImage(dataUrl);
      return compressImageElement(imageElement, {
        maxDimension: imageLimits.signatureMaxDimension,
        maxBytes: imageLimits.signatureMaxBytes,
        mimeType: "image/png",
      });
    } catch (error) {
      console.warn("Impossible de retraiter la signature.", error);
      return "";
    }
  }

  function compressTicketImageElement(imageElement) {
    return compressImageElement(imageElement, {
      maxDimension: imageLimits.ticketMaxDimension,
      maxBytes: imageLimits.ticketMaxBytes,
      mimeType: "image/jpeg",
      backgroundColor: "#ffffff",
    });
  }

  function compressImageElement(imageElement, options) {
    if (!imageElement || !options) return "";
    const { maxDimension, maxBytes, mimeType = "image/jpeg", backgroundColor } = options;
    let { width, height } = imageElement;
    if (!width || !height) return "";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const limit = maxDimension || 1600;
    if (width > limit || height > limit) {
      const scale = Math.min(limit / width, limit / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    canvas.width = width;
    canvas.height = height;
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(imageElement, 0, 0, width, height);
    const isPng = mimeType === "image/png";
    let quality = isPng ? undefined : 0.85;
    let dataUrl = canvas.toDataURL(mimeType, quality);
    const bytesLimit = maxBytes || imageLimits.ticketMaxBytes;
    while (!isPng && estimateDataUrlBytes(dataUrl) > bytesLimit && quality > 0.5) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL(mimeType, quality);
    }
    if (estimateDataUrlBytes(dataUrl) > bytesLimit) {
      console.warn("Impossible de compresser suffisamment l'image.");
      return "";
    }
    return dataUrl;
  }

  // -----------------------------
  // Dashboard
  // -----------------------------
  function getFilteredEntries() {
    const start = document.getElementById("filter-start")?.value;
    const end = document.getElementById("filter-end")?.value;
    const text = (document.getElementById("filter-text")?.value || "").toLowerCase();
    return state.entries.filter((entry) => {
      const date = entry.date ? new Date(entry.date) : null;
      if (start && date && date < new Date(start)) return false;
      if (end && date && date > new Date(end)) return false;
      if (text) {
        const haystack = [entry.reference, getEntryContactLabel(entry), entry.category, entry.notes]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });
  }

  function renderDashboard() {
    const entries = getFilteredEntries().sort(sortByDate);
    const totals = entries.reduce(
      (acc, entry) => {
        const { tvaAmount, amountTTC } = computeEntryAmounts(entry);
        if (entry.type === "income") {
          acc.income += amountTTC;
          acc.tva += tvaAmount;
        } else {
          acc.expense += amountTTC;
          acc.tva -= tvaAmount;
        }
        return acc;
      },
      { income: 0, expense: 0, tva: 0 }
    );
    const balance = totals.income - totals.expense;
    document.getElementById("stat-income").textContent = formatCurrency(totals.income);
    document.getElementById("stat-expense").textContent = formatCurrency(totals.expense);
    document.getElementById("stat-balance").textContent = formatCurrency(balance);
    document.getElementById("stat-tva").textContent = formatCurrency(totals.tva);

    const tbody = document.getElementById("dashboard-body");
    if (tbody) {
      tbody.innerHTML = entries
        .map((entry) => {
          const { tvaAmount, amountTTC } = computeEntryAmounts(entry);
          return `
            <tr>
              <td>${formatDateNumeric(entry.date)}</td>
              <td>${entry.type === "income" ? "Recette" : "Dépense"}</td>
              <td>${entry.reference || "-"}</td>
              <td>${getEntryContactLabel(entry)}</td>
              <td>${entry.category || "-"}</td>
              <td>${formatCurrency(entry.amountHT)}</td>
              <td>${formatCurrency(tvaAmount)}</td>
              <td>${formatCurrency(amountTTC)}</td>
              <td>${entry.status || "-"}</td>
            </tr>
          `;
        })
        .join("");
    }
  }

  function renderPreview() {
    document.getElementById("preview-period").textContent =
      state.meta.periodStart || state.meta.periodEnd
        ? `${formatDateFr(state.meta.periodStart)} – ${formatDateFr(state.meta.periodEnd)}`
        : "-";
    document.getElementById("preview-dossier").textContent = state.meta.dossierTitle || "-";
    document.getElementById("preview-company").textContent = state.meta.company || "-";
    document.getElementById("preview-observations").textContent = state.meta.observations || "-";
    updatePreviewIban();
    updatePeriodSummary();

    const tbody = document.getElementById("preview-body");
    tbody.innerHTML = "";
    let totalHT = 0;
    let totalTVA = 0;
    let totalTTC = 0;

    state.entries
      .slice()
      .sort(sortByDate)
      .forEach((entry) => {
        const { tvaAmount, amountTTC } = computeEntryAmounts(entry);
        totalHT += entry.amountHT;
        totalTVA += tvaAmount;
        totalTTC += amountTTC;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${formatDateNumeric(entry.date)}</td>
          <td>${entry.type === "income" ? "Recette" : "Dépense"}</td>
          <td>${entry.reference || "-"}</td>
          <td>${getEntryContactLabel(entry)}</td>
          <td>${entry.category || "-"}</td>
          <td>${formatCurrency(entry.amountHT)}</td>
          <td>${formatCurrency(tvaAmount)}</td>
          <td>${formatCurrency(amountTTC)}</td>
          <td>${entry.paymentMethod || "-"}</td>
          <td>${entry.status || "-"}</td>
        `;
        tbody.appendChild(tr);
      });

    document.getElementById("preview-total-ht").textContent = formatCurrency(totalHT);
    document.getElementById("preview-total-tva").textContent = formatCurrency(totalTVA);
    document.getElementById("preview-total-ttc").textContent = formatCurrency(totalTTC);
    document.getElementById("preview-total-balance").textContent = `Solde : ${formatCurrency(
      totalETBalance()
    )}`;

    const signatureEl = document.getElementById("preview-signature");
    if (state.signature) {
      signatureEl.src = state.signature;
      signatureEl.style.display = "block";
    } else {
      signatureEl.removeAttribute("src");
      signatureEl.style.display = "none";
    }
  }

  function updatePreviewIban() {
    const container = document.getElementById("preview-iban");
    if (!container) return;
    const iban = state.company?.iban || "";
    if (iban) {
      container.hidden = false;
      container.textContent = `IBAN : ${iban}`;
    } else {
      container.hidden = true;
      container.textContent = "";
    }
  }

  function totalETBalance() {
    const totals = state.entries.reduce(
      (acc, entry) => {
        const { amountTTC } = computeEntryAmounts(entry);
        if (entry.type === "income") acc.income += amountTTC;
        else acc.expense += amountTTC;
        return acc;
      },
      { income: 0, expense: 0 }
    );
    return totals.income - totals.expense;
  }

  function updatePeriodSummary() {
    const summary = document.getElementById("week-summary");
    if (!summary) return;
    const template = getText(
      "header.summaryPlaceholder",
      "Période active : du {start} au {end} — {datetime}"
    );
    const start = state.meta.periodStart ? formatDateFr(state.meta.periodStart) : "-";
    const end = state.meta.periodEnd ? formatDateFr(state.meta.periodEnd) : "-";
    summary.textContent = formatTemplate(template, {
      start,
      end,
      datetime: new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    });
  }

  // -----------------------------
  // Documents (devis / factures)
  // -----------------------------
  function renderDocLines(lines = []) {
    const container = document.getElementById("doc-lines-container");
    if (!container) return;
    container.innerHTML = "";
    (lines.length ? lines : [defaultDocLine()]).forEach((line, index) => addDocLine(line, index));
  }

  function addDocLine(line = defaultDocLine(), index = null) {
    const container = document.getElementById("doc-lines-container");
    if (!container) return;
    const position = index ?? container.children.length;
    const wrapper = document.createElement("div");
    wrapper.className = "doc-line";
    wrapper.dataset.lineIndex = position;
    wrapper.innerHTML = `
      <div class="form-field">
        <label>Description</label>
        <input type="text" data-line-field="description" value="${line.description || ""}" />
      </div>
      <div class="form-field">
        <label>Qté</label>
        <input type="number" step="0.01" min="0" data-line-field="qty" value="${line.qty ?? 1}" />
      </div>
      <div class="form-field">
        <label>PU HT</label>
        <input type="number" step="0.01" min="0" data-line-field="unit" value="${line.unit ?? 0}" />
      </div>
      <div class="form-field">
        <label>TVA (%)</label>
        <select data-line-field="tva">
          ${(CONFIG.accounting?.tvaRates || [0, 5.5, 10, 20])
            .map(
              (rate) =>
                `<option value="${rate}" ${Number(line.tva) === Number(rate) ? "selected" : ""}>${rate}%</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="form-field">
        <label>Action</label>
        <button type="button" class="btn btn-secondary" data-line-remove>Supprimer</button>
      </div>
    `;
    container.appendChild(wrapper);
  }

  function readDocForm() {
    const lines = Array.from(document.querySelectorAll("#doc-lines-container .doc-line")).map((row) => ({
      id: uuid(),
      description: row.querySelector('[data-line-field="description"]')?.value || "",
      qty: parseNumber(row.querySelector('[data-line-field="qty"]')?.value || 0),
      unit: parseNumber(row.querySelector('[data-line-field="unit"]')?.value || 0),
      tva: parseNumber(row.querySelector('[data-line-field="tva"]')?.value || 0),
    }));
    return {
      id: document.getElementById("doc-form").dataset.editingId || uuid(),
      type: document.getElementById("doc-type")?.value || "devis",
      number: document.getElementById("doc-number")?.value || "",
      date: document.getElementById("doc-date")?.value || "",
      due: document.getElementById("doc-due")?.value || "",
      clientId: document.getElementById("doc-client")?.value || "",
      clientFree: document.getElementById("doc-client-free")?.value || "",
      microActivity: document.getElementById("doc-activity")?.value || "liberal",
      status: document.getElementById("doc-status")?.value || "",
      paymentMethod: document.getElementById("doc-payment")?.value || "",
      depositPercent: parseNumber(document.getElementById("doc-deposit-percent")?.value || 0),
      depositPaid: parseNumber(document.getElementById("doc-deposit-paid")?.value || 0),
      notes: document.getElementById("doc-notes")?.value || "",
      lines: lines.length ? lines : [defaultDocLine()],
    };
  }

  function computeDocTotals(doc) {
    const totals = (doc.lines || []).reduce(
      (acc, line) => {
        const ht = parseNumber(line.unit) * parseNumber(line.qty || 0);
        const tvaAmount = ht * (parseNumber(line.tva) / 100);
        acc.ht += ht;
        acc.tva += tvaAmount;
        acc.ttc += ht + tvaAmount;
        return acc;
      },
      { ht: 0, tva: 0, ttc: 0 }
    );
    const depositPercent = parseNumber(doc.depositPercent);
    const depositPaid = parseNumber(doc.depositPaid);
    const depositDue = depositPercent ? (totals.ttc * depositPercent) / 100 : 0;
    return { ...totals, depositPercent, depositPaid, depositDue };
  }

  function renderDocTable() {
    const tbody = document.getElementById("doc-table-body");
    if (!tbody) return;
    tbody.innerHTML = state.documents
      .map((doc) => {
        const totals = computeDocTotals(doc);
        return `
          <tr data-doc-id="${doc.id}">
            <td>${doc.type}</td>
            <td>${doc.number || "-"}</td>
            <td>${formatDateNumeric(doc.date)}</td>
            <td>${resolveDocClient(doc)}</td>
            <td>${doc.status || "-"}</td>
            <td>
              <input type="checkbox" data-doc-action="toggle-paid" ${
                isPaid(doc.status) ? "checked" : ""
              } aria-label="Marquer comme payé" />
            </td>
            <td>${formatCurrency(totals.ht)}</td>
            <td>${formatCurrency(totals.tva)}</td>
            <td>${formatCurrency(totals.ttc)}</td>
            <td>
              <button class="table-link" data-doc-action="view">Aperçu</button>
              <button class="table-link" data-doc-action="delete">Supprimer</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function resolveDocClient(doc) {
    if (doc.clientId) {
      const c = state.contacts.clients.find((client) => client.id === doc.clientId);
      if (c) return c.name;
    }
    return doc.clientFree || "-";
  }

  function renderDocPreview(doc) {
    if (!doc) return;
    const totals = computeDocTotals(doc);
    document.getElementById("doc-preview-type").textContent = `${doc.type} — ${resolveActivityLabel(
      doc.microActivity
    )}`;
    document.getElementById("doc-preview-number").textContent = doc.number || "-";
    document.getElementById("doc-preview-date").textContent = formatDateFr(doc.date);
    document.getElementById("doc-preview-due").textContent = doc.due ? `Échéance : ${formatDateFr(doc.due)}` : "-";
    document.getElementById("doc-preview-client").textContent = resolveDocClient(doc);
    fillDocCompanyInfo();
    renderDocDeposit(doc);
    toggleDocMicroMention();

    const body = document.getElementById("doc-preview-body");
    body.innerHTML = (doc.lines || [])
      .map((line) => {
        const ht = parseNumber(line.unit) * parseNumber(line.qty || 0);
        const tvaAmount = ht * (parseNumber(line.tva) / 100);
        return `
          <tr>
            <td>${line.description || "-"}</td>
            <td>${line.qty || 0}</td>
            <td>${formatCurrency(line.unit)}</td>
            <td>${line.tva || 0}%</td>
            <td>${formatCurrency(ht)}</td>
            <td>${formatCurrency(ht + tvaAmount)}</td>
          </tr>
        `;
      })
      .join("");
    document.getElementById("doc-preview-ht").textContent = formatCurrency(totals.ht);
    document.getElementById("doc-preview-ttc").textContent = formatCurrency(totals.ttc);
  }

  function renderDocDeposit(doc) {
    const container = document.getElementById("doc-deposit-block");
    if (!container) return;
    const totals = computeDocTotals(doc);
    const isDevis = doc.type === "devis";
    const hasDeposit = isDevis ? totals.depositPercent > 0 : totals.depositPaid > 0;
    container.hidden = !hasDeposit;
    if (!hasDeposit) {
      container.innerHTML = "";
      return;
    }
    if (isDevis) {
      container.innerHTML = `
        <div><strong>Acompte demandé :</strong> ${totals.depositPercent}% (${formatCurrency(totals.depositDue)})</div>
        <div><em>À verser avant exécution des travaux</em></div>
      `;
    } else {
      const remaining = Math.max(0, totals.ttc - totals.depositPaid);
      container.innerHTML = `
        <div><strong>Acompte versé :</strong> ${formatCurrency(totals.depositPaid)}</div>
        <div><strong>Solde restant :</strong> ${formatCurrency(remaining)}</div>
      `;
    }
  }

  function toggleDocMicroMention() {
    const mention = document.getElementById("doc-micro-mention");
    if (!mention) return;
    const isExempt = !!state.company?.microTvaExempt;
    mention.hidden = !isExempt;
  }

  function fillDocCompanyInfo() {
    const c = state.company || {};
    const name = document.getElementById("doc-company-name");
    const status = document.getElementById("doc-company-status");
    const address = document.getElementById("doc-company-address");
    const siren = document.getElementById("doc-company-siren");
    const vat = document.getElementById("doc-company-vat");
    const iban = document.getElementById("doc-company-iban");
    const contact = document.getElementById("doc-company-contact");
    if (name) name.textContent = c.legalName || state.meta.company || "-";
    if (status) status.textContent = c.status || "";
    if (address) address.textContent = c.address || "";
    if (siren) siren.textContent = c.siren ? `SIREN/SIRET : ${c.siren}` : "";
    if (vat) vat.textContent = c.vat ? `TVA : ${c.vat}` : "";
    if (iban) iban.textContent = c.iban ? `IBAN : ${c.iban}` : "";
    if (contact) contact.textContent = [c.phone, c.email].filter(Boolean).join(" · ");
    const logo = document.getElementById("doc-logo");
    if (logo) {
      if (c.logo) {
        logo.src = c.logo;
        logo.style.display = "block";
      } else {
        logo.removeAttribute("src");
        logo.style.display = "none";
      }
    }
  }

  function clearDocForm() {
    const form = document.getElementById("doc-form");
    if (!form) return;
    form.reset();
    form.dataset.editingId = "";
    renderDocLines();
  }

  function populateDocForm(doc) {
    if (!doc) return;
    const form = document.getElementById("doc-form");
    if (!form) return;
    form.dataset.editingId = doc.id;
    document.getElementById("doc-type").value = doc.type || "devis";
    document.getElementById("doc-number").value = doc.number || "";
    document.getElementById("doc-date").value = doc.date || "";
    document.getElementById("doc-due").value = doc.due || "";
    document.getElementById("doc-client").value = doc.clientId || "";
    document.getElementById("doc-client-free").value = doc.clientFree || "";
    document.getElementById("doc-activity").value = doc.microActivity || "liberal";
    document.getElementById("doc-status").value = doc.status || "";
    document.getElementById("doc-payment").value = doc.paymentMethod || "";
    document.getElementById("doc-deposit-percent").value = doc.depositPercent || 0;
    document.getElementById("doc-deposit-paid").value = doc.depositPaid || 0;
    document.getElementById("doc-notes").value = doc.notes || "";
    renderDocLines(doc.lines || []);
  }

  function handleDocSubmit(event) {
    event.preventDefault();
    const doc = readDocForm();
    const index = state.documents.findIndex((d) => d.id === doc.id);
    if (index >= 0) {
      state.documents[index] = doc;
    } else {
      state.documents.push(doc);
    }
    syncEntryFromDoc(doc);
    saveState();
    clearDocForm();
    renderDocPreview(doc);
  }

  function handleDocActions(event) {
    const action = event.target.dataset.docAction;
    if (!action) return;
    const row = event.target.closest("tr");
    const id = row?.dataset.docId;
    if (!id) return;
    const doc = state.documents.find((d) => d.id === id);
    if (action === "delete") {
      state.documents = state.documents.filter((d) => d.id !== id);
      state.entries = state.entries.filter((entry) => entry.docId !== id);
      saveState();
      return;
    }
    if (action === "view") {
      renderDocPreview(doc);
      populateDocForm(doc);
      return;
    }
    if (action === "toggle-paid") {
      const checked = event.target.checked;
      const newStatus = checked ? "payé" : doc.status || "enregistré";
      updateDocStatus(doc.id, newStatus, { forceSync: checked });
    }
  }

  function updateDocStatus(docId, status, options = {}) {
    const index = state.documents.findIndex((d) => d.id === docId);
    if (index === -1) return;
    state.documents[index].status = status;
    if (options.forceSync) {
      syncEntryFromDoc(state.documents[index], { force: true });
    } else {
      syncEntryFromDoc(state.documents[index]);
    }
    saveState();
  }

  function syncEntryFromDoc(doc, options = {}) {
    if (!doc) return;
    const force = options.force === true;
    if (!force && (doc.type !== "facture" || !isPaid(doc.status))) {
      state.entries = state.entries.filter((entry) => entry.docId !== doc.id);
      return;
    }
    const workingDoc = {
      ...doc,
      type: "facture",
      status: doc.status || "payé",
    };
    const totals = computeDocTotals(doc);
    const rate = totals.ht > 0 ? Math.round((totals.tva / totals.ht) * 100 * 100) / 100 : 0;
    const incomeCategory =
      state.meta.incomeCategories?.[0] || CONFIG.accounting?.incomeCategories?.[0] || "Recettes";
    const entryPayload = {
      ...defaultEntry("income"),
      docId: workingDoc.id,
      date: workingDoc.date || "",
      reference: workingDoc.number || "",
      contactId: workingDoc.clientId || "",
      fallbackContact: workingDoc.clientFree || "",
      microActivity: workingDoc.microActivity || "liberal",
      category: incomeCategory,
      amountHT: totals.ht,
      tvaRate: rate,
      amountTTC: totals.ttc,
      paymentMethod: workingDoc.paymentMethod || "",
      status: workingDoc.status || "",
      notes: workingDoc.notes || "",
    };
    const existingIndex = state.entries.findIndex((entry) => entry.docId === doc.id);
    if (existingIndex >= 0) {
      state.entries[existingIndex] = { ...state.entries[existingIndex], ...entryPayload };
    } else {
      state.entries.push(entryPayload);
    }
  }

  function syncAllDocsToEntries() {
    state.documents.forEach((doc) => syncEntryFromDoc(doc));
  }

  // -----------------------------
  // Micro entreprise
  // -----------------------------
  function renderMicro() {
    const { turnoverFromEntries, dueFromEntries } = computeMicroDueFromEntries();
    const turnover = state.meta.microTurnover || turnoverFromEntries;
    const due = state.meta.microTurnover ? turnover * (computeAverageMicroRate() / 100) : dueFromEntries;
    const paid = state.microPayments.reduce((acc, p) => acc + parseNumber(p.amount), 0);
    const balance = due - paid;
    const net = turnover - due;
    document.getElementById("micro-turnover").value = turnover || "";
    document.getElementById("micro-due").textContent = formatCurrency(due);
    document.getElementById("micro-paid").textContent = formatCurrency(paid);
    document.getElementById("micro-balance").textContent = formatCurrency(balance);
    document.getElementById("micro-net").textContent = formatCurrency(net);
    renderMicroBreakdown();
  }

  function computeAverageMicroRate() {
    const activities = getMicroActivities();
    const getRate = (activity) => activities.find((a) => a.value === activity)?.rate ?? 0;
    const paidEntries = state.entries.filter(
      (entry) => entry.type === "income" && isPaid(entry.status)
    );
    if (!paidEntries.length) return activities[0]?.rate || 0;
    const sum = paidEntries.reduce((acc, entry) => acc + getRate(entry.microActivity || "liberal"), 0);
    return sum / paidEntries.length;
  }

  function computeMicroDueFromEntries() {
    const activities = getMicroActivities();
    const getRate = (activity) => activities.find((a) => a.value === activity)?.rate ?? 0;
    const paidEntries = state.entries.filter(
      (entry) => entry.type === "income" && isPaid(entry.status)
    );
    return paidEntries.reduce(
      (acc, entry) => {
        const amount = computeEntryAmounts(entry).amountTTC;
        const activityKey = entry.microActivity || "liberal";
        const rate = getRate(activityKey);
        acc.turnoverFromEntries += amount;
        acc.dueFromEntries += amount * (rate / 100);
        return acc;
      },
      { turnoverFromEntries: 0, dueFromEntries: 0 }
    );
  }

  function getMicroActivities() {
    return DEFAULT_MICRO_ACTIVITIES;
  }

  function resolveActivityLabel(value) {
    const match = getMicroActivities().find((a) => a.value === value);
    return match ? match.label : "Activité";
  }

  function renderMicroPayments() {
    const tbody = document.getElementById("micro-pay-body");
    if (!tbody) return;
    tbody.innerHTML = state.microPayments
      .map(
        (p) => `
        <tr data-micro-id="${p.id}">
          <td>${formatDateNumeric(p.date)}</td>
          <td>${formatCurrency(p.amount)}</td>
          <td>${p.notes || ""}</td>
          <td><button class="table-link danger" data-micro-action="delete">Supprimer</button></td>
        </tr>
      `
      )
      .join("");
  }

  function addMicroPayment(payment) {
    const entryId = createUrssafExpenseFromPayment(payment);
    state.microPayments.push({
      id: payment.id || uuid(),
      date: payment.date || "",
      amount: parseNumber(payment.amount),
      notes: payment.notes || "",
      entryId,
    });
    renderMicroPayments();
    renderMicro();
  }

  function ensureUrssafCategory() {
    const label = "Cotisations URSSAF";
    if (!Array.isArray(state.meta.expenseCategories)) {
      state.meta.expenseCategories = [];
    }
    if (!state.meta.expenseCategories.includes(label)) {
      state.meta.expenseCategories = mergeUnique(state.meta.expenseCategories, [label]);
    }
  }

  function createUrssafExpenseFromPayment(payment) {
    ensureUrssafCategory();
    const expense = defaultEntry("expense");
    const amount = parseNumber(payment.amount);
    expense.date = payment.date || "";
    expense.reference = payment.notes ? `URSSAF - ${payment.notes}` : "URSSAF";
    expense.category = "Cotisations URSSAF";
    expense.tvaRate = 0;
    expense.amountHT = amount;
    expense.amountTTC = amount;
    expense.paymentMethod = state.meta.paymentMethods?.[0] || expense.paymentMethod;
    expense.status = "payé";
    expense.notes = payment.notes || "";
    state.entries.push(expense);
    return expense.id;
  }

  function removeUrssafExpense(entryId) {
    if (!entryId) return;
    state.entries = state.entries.filter((e) => e.id !== entryId);
  }

  function renderMicroBreakdown() {
    const container = document.getElementById("micro-activity-breakdown");
    if (!container) return;
    const breakdown = buildMicroDueBreakdown();
    container.innerHTML = breakdown
      .map(
        (item) =>
          `<div><strong>${item.label}</strong><br>Due : ${formatCurrency(item.due)}<br>Recettes : ${formatCurrency(
            item.turnover
          )}</div>`
      )
      .join("");
  }

  function buildMicroDueBreakdown() {
    const activities = getMicroActivities();
    const getRate = (activity) => activities.find((a) => a.value === activity)?.rate ?? 0;
    const paidEntries = state.entries.filter(
      (entry) => entry.type === "income" && isPaid(entry.status)
    );
    const byActivity = paidEntries.reduce((acc, entry) => {
      const activityKey = entry.microActivity || "liberal";
      if (!acc[activityKey]) {
        acc[activityKey] = { turnover: 0, due: 0 };
      }
      const amount = computeEntryAmounts(entry).amountTTC;
      acc[activityKey].turnover += amount;
      acc[activityKey].due += amount * (getRate(activityKey) / 100);
      return acc;
    }, {});
    return activities.map((act) => ({
      value: act.value,
      label: act.label,
      turnover: byActivity[act.value]?.turnover || 0,
      due: byActivity[act.value]?.due || 0,
    }));
  }

  // -----------------------------
  // Calendrier recettes/dépenses
  // -----------------------------
  function renderExpenseCalendar() {
    const container = document.getElementById("expense-calendar");
    if (!container) return;
    const monthInput = document.getElementById("expense-month");
    const monthValue = monthInput?.value || buildMonthString(new Date());
    if (monthInput && !monthInput.value) monthInput.value = monthValue;
    const today = new Date();
    const todayKey = formatDateKey(today);
    const weekSpan = document.getElementById("calendar-current-week");
    const dateSpan = document.getElementById("calendar-current-date");
    if (dateSpan) dateSpan.textContent = `Aujourd'hui : ${formatDateNumeric(today)}`;
    if (weekSpan) weekSpan.textContent = `Semaine ${getIsoWeek(today)}`;
    const { start, end } = getMonthRange(monthValue);
    const days = [];
    const firstDay = new Date(start);
    const offset = (firstDay.getDay() + 6) % 7;
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() - offset);
    for (let i = 0; i < 42; i += 1) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const expenses = state.entries.filter((e) => e.type === "expense");
    const incomes = state.entries.filter((e) => e.type === "income");
    const dayHeads = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
      .map((d) => `<div class="calendar-dayhead">${d}</div>`)
      .join("");
    const cells = days
      .map((date) => {
        const inMonth = date >= start && date <= end;
        const iso = formatDateKey(date);
        const isToday = iso === todayKey;
        const totalExpense = expenses
          .filter((e) => e.date === iso)
          .reduce((acc, e) => acc + computeEntryAmounts(e).amountTTC, 0);
        const totalIncome = incomes
          .filter((e) => e.date === iso)
          .reduce((acc, e) => acc + computeEntryAmounts(e).amountTTC, 0);
        return `
          <div class="calendar-cell ${inMonth ? "" : "inactive"} ${isToday ? "today" : ""}">
            <div>${String(date.getDate()).padStart(2, "0")}</div>
            <div class="cell-total" style="color:#dc2626;">${totalExpense ? formatCurrency(totalExpense) : ""}</div>
            <div class="cell-total" style="color:#16a34a;">${totalIncome ? formatCurrency(totalIncome) : ""}</div>
          </div>
        `;
      })
      .join("");
    container.innerHTML = `${dayHeads}${cells}`;
  }

  function buildMonthString(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthRange(monthValue) {
    const parts = (monthValue || "").split("-");
    const year = Number(parts[0]) || new Date().getFullYear();
    const month = Number(parts[1]) || new Date().getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return { start, end };
  }

  // -----------------------------
  // Import/Export/Print
  // -----------------------------
  function handleFileInput(input, key) {
    const file = input.files[0];
    if (!file) return;
    if (key === "signature") {
      handleSignatureFile(file);
    }
  }

  async function handleSignatureFile(file) {
    try {
      const optimizedSignature = await prepareSignatureImage(file);
      if (!optimizedSignature) {
        alert(
          getText(
            "alerts.signatureTooLarge",
            "La signature est trop volumineuse. Réessayez avec une image plus légère (PNG recommandé)."
          )
        );
        return;
      }
      state.signature = optimizedSignature;
      saveState();
    } catch {
      alert(getText("alerts.signatureImportError", "La signature n'a pas pu être importée."));
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const prefix = CONFIG.exportFilePrefix || "compta";
    link.href = url;
    link.download = `${prefix}-${state.meta.periodStart || "periode"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = JSON.parse(reader.result);
        const base = defaultState();
        const optimizePieces = await Promise.all(
          (imported.pieces || []).map(async (piece) => {
            if (!piece.image) return { ...piece };
            const optimizedImage = await optimizeTicketImageDataUrl(piece.image);
            return { ...piece, image: optimizedImage };
          })
        );
        state = {
          ...base,
          ...imported,
          meta: {
            ...base.meta,
            ...(imported.meta || {}),
            incomeCategories: mergeUnique(base.meta.incomeCategories, imported.meta?.incomeCategories),
            expenseCategories: mergeUnique(base.meta.expenseCategories, imported.meta?.expenseCategories),
            paymentMethods: mergeUnique(base.meta.paymentMethods, imported.meta?.paymentMethods),
          },
          company: { ...base.company, ...(imported.company || {}) },
          entries: Array.isArray(imported.entries) ? imported.entries.map(normalizeEntry) : [],
          contacts: {
            clients: Array.isArray(imported.contacts?.clients)
              ? imported.contacts.clients.map((c) => normalizeContact(c, "client"))
              : [],
            fournisseurs: Array.isArray(imported.contacts?.fournisseurs)
              ? imported.contacts.fournisseurs.map((c) => normalizeContact(c, "fournisseur"))
              : [],
          },
          pieces: optimizePieces.map(normalizePiece),
          documents: Array.isArray(imported.documents)
            ? imported.documents.map((doc) => ({
                ...defaultDocument(),
                ...doc,
                lines: Array.isArray(doc.lines)
                  ? doc.lines.map((line) => ({ ...defaultDocLine(), ...line }))
                  : [defaultDocLine()],
              }))
            : [],
        microPayments: Array.isArray(imported.microPayments)
          ? imported.microPayments.map((p) => ({
              id: p.id || uuid(),
              date: p.date || "",
              amount: parseNumber(p.amount),
              notes: p.notes || "",
              entryId: p.entryId || "",
            }))
          : [],
          signature: imported.signature
            ? await optimizeSignatureImageDataUrl(imported.signature)
            : "",
        };
        syncAllDocsToEntries();
        saveState();
        populateForms();
      } catch (error) {
        console.error("Échec de l'import du fichier JSON :", error);
        alert(getText("alerts.invalidJson", "Ce fichier n'est pas valide ou dépasse la limite autorisée."));
      }
    };
    reader.onerror = () => {
      alert(getText("alerts.unreadableFile", "Impossible de lire ce fichier."));
    };
    reader.readAsText(file);
  }

  function triggerPrint(mode) {
    applyPrintClass(mode);
    window.print();
  }

  function applyPrintClass(mode) {
    document.body.classList.remove(PRINT_JOURNAL_CLASS, PRINT_PIECES_CLASS, PRINT_DOC_CLASS);
    let className = PRINT_JOURNAL_CLASS;
    if (mode === "pieces") className = PRINT_PIECES_CLASS;
    if (mode === "document") className = PRINT_DOC_CLASS;
    document.body.classList.add(className);
    if (mode === "document") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  // -----------------------------
  // Navigation & events
  // -----------------------------
  function setActivePanel(target, options = {}) {
    const { skipScroll = false } = options;
    if (!target) return;
    document.querySelectorAll(".tabs button, .sidebar-nav button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.target === target);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      const isActive = panel.dataset.panel === target;
      panel.classList.toggle("active", isActive);
      if (isActive) {
        panel.classList.remove("panel-animated");
        void panel.offsetWidth;
        panel.classList.add("panel-animated");
      }
    });
    if (target === "pieces") renderPieces();
    if (target === "documents") renderDocTable();
    if (window.innerWidth >= 768 && !skipScroll) {
      const targetPanel = document.querySelector(`.panel[data-panel="${target}"]`) || document.querySelector(".workspace");
      targetPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function attachNavigation() {
    const buttons = document.querySelectorAll(".tabs button, .sidebar-nav button");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setActivePanel(btn.dataset.target);
      });
    });
    const defaultTarget =
      document.querySelector(".tabs button.active, .sidebar-nav button.active")?.dataset.target || "dashboard";
    setActivePanel(defaultTarget, { skipScroll: true });
  }

  function setupFilters() {
    ["filter-start", "filter-end", "filter-text"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", renderDashboard);
    });
  }

  function setupCalendarEvents() {
    document.getElementById("expense-month")?.addEventListener("input", renderExpenseCalendar);
  }

  function setupTablesActions() {
    const incomeTable = document.getElementById("income-table-body");
    const expenseTable = document.getElementById("expense-table-body");
    [incomeTable, expenseTable].forEach((table) => {
      if (!table) return;
      table.addEventListener("click", (event) => {
        const action = event.target.dataset.action;
        if (!action) return;
        const row = event.target.closest("tr");
        const id = row?.dataset.entryId;
        const type = event.target.dataset.entryType || "income";
        if (!id) return;
        if (action === "delete") {
          state.entries = state.entries.filter((entry) => entry.id !== id);
          saveState();
        }
        if (action === "edit") {
          const entry = state.entries.find((item) => item.id === id);
          const form = document.getElementById(type === "expense" ? "expense-form" : "income-form");
          populateEntryForm(form, entry);
          setActivePanel(type === "expense" ? "depenses" : "recettes");
        }
      });
    });
  }

  function setupTopNav() {
    const toggle = document.getElementById("top-nav-toggle");
    const links = document.getElementById("top-nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => links.classList.remove("open"));
    });
  }

  function setupInfoScrollShortcut() {
    const infoLink = document.querySelector('.top-nav-links a[href="#info-dossier"]');
    const infoSection = document.getElementById("info-dossier");
    if (!infoLink || !infoSection) return;
    infoLink.addEventListener("click", (event) => {
      event.preventDefault();
      infoSection.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("top-nav-links")?.classList.remove("open");
    });
  }

  function setupPageTransitions() {
    if (window.GLOBAL_PAGE_TRANSITION) return;
    const overlay = document.getElementById("page-transition");
    if (!overlay) return;
    const linkSelector = ".top-nav-links a, .file-actions a";
    document.querySelectorAll(linkSelector).forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");
        if (href === "#info-dossier") {
          event.preventDefault();
          document.getElementById("info-dossier")?.scrollIntoView({ behavior: "smooth", block: "start" });
          document.getElementById("top-nav-links")?.classList.remove("open");
          return;
        }
        if (!href || href.startsWith("#")) return;
        event.preventDefault();
        overlay.classList.add("active");
        setTimeout(() => {
          window.location.href = href;
        }, 180);
      });
    });
    window.addEventListener("pageshow", () => overlay.classList.remove("active"));
  }

  function setupSmoothScroll() {
    // Integré dans setupPageTransitions (conservé pour compat éventuelle)
  }

  function setupAmountAutoCalc() {
    document.querySelectorAll(".entry-form").forEach((form) => {
      form.addEventListener("input", (event) => {
        const name = event.target.dataset.field;
        if (name === "amountHT" || name === "tvaRate") {
          const ht = parseNumber(form.querySelector('[data-field="amountHT"]')?.value);
          const rate = parseNumber(form.querySelector('[data-field="tvaRate"]')?.value);
          const ttcField = form.querySelector('[data-field="amountTTC"]');
          if (ttcField) {
            ttcField.value = ht > 0 ? (ht * (1 + rate / 100)).toFixed(2) : ttcField.value;
          }
        }
      });
    });
  }

  function setupResetButtons() {
    document.querySelectorAll("[data-reset-form]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const form = btn.closest("form");
        if (!form) return;
        if (form.classList.contains("entry-form")) {
          clearEntryForm(form);
        } else {
          form.reset();
        }
      });
    });
  }

  function resetPanelDisplay() {
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.style.display = "";
    });
    const activeBtn = document.querySelector(".tabs button.active, .sidebar-nav button.active");
    const target = activeBtn?.dataset.target || "dashboard";
    setActivePanel(target, { skipScroll: true });
  }

  function setupCollapsibleSections() {
    document.querySelectorAll(".collapsible-trigger").forEach((trigger) => {
      const panelId = trigger.dataset.collapseTarget;
      const panel = document.getElementById(panelId);
      const container = trigger.closest(".collapsible-card");
      if (!panel || !container) return;
      trigger.setAttribute("aria-controls", panelId);
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      container.classList.toggle("is-collapsed", panel.hidden);
      trigger.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        const isOpen = !panel.hidden;
        trigger.setAttribute("aria-expanded", String(isOpen));
        container.classList.toggle("is-collapsed", !isOpen);
      });
    });
  }

  function setupSaveLoadButtons() {
    const importInput = document.getElementById("import-input");
    document.querySelectorAll(".btn-save").forEach((btn) => {
      btn.addEventListener("click", () => exportData());
    });
    document.querySelectorAll(".btn-load").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (importInput) importInput.click();
      });
    });
  }

  // -----------------------------
  // Micro payments events
  // -----------------------------
  function setupMicroPaymentEvents() {
    document.getElementById("micro-payment-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const payment = {
        date: document.getElementById("micro-pay-date")?.value || "",
        amount: document.getElementById("micro-pay-amount")?.value || 0,
        notes: document.getElementById("micro-pay-notes")?.value || "",
      };
      addMicroPayment(payment);
      saveState();
      e.target.reset();
    });
    document.getElementById("micro-pay-reset")?.addEventListener("click", () => {
      document.getElementById("micro-payment-form")?.reset();
    });
    document.getElementById("micro-pay-body")?.addEventListener("click", (event) => {
      if (event.target.dataset.microAction === "delete") {
        const row = event.target.closest("tr");
        const id = row?.dataset.microId;
        if (!id) return;
        const payment = state.microPayments.find((p) => p.id === id);
        if (payment?.entryId) {
          removeUrssafExpense(payment.entryId);
        }
        state.microPayments = state.microPayments.filter((p) => p.id !== id);
        renderMicroPayments();
        renderMicro();
        saveState();
      }
    });
  }

  // -----------------------------
  // Doc events
  // -----------------------------
  function setupDocEvents() {
    document.getElementById("add-doc-line")?.addEventListener("click", () => addDocLine());
    document.getElementById("doc-lines-container")?.addEventListener("click", (event) => {
      if (event.target?.dataset?.lineRemove !== undefined) {
        const row = event.target.closest(".doc-line");
        row?.remove();
      }
    });
    document.getElementById("doc-form")?.addEventListener("submit", handleDocSubmit);
    document.getElementById("doc-table-body")?.addEventListener("click", handleDocActions);
    document.getElementById("doc-table-body")?.addEventListener("change", handleDocActions);
    document.getElementById("doc-reset")?.addEventListener("click", clearDocForm);
    document.getElementById("doc-payment")?.addEventListener("change", () => saveState());
    document.getElementById("doc-client")?.addEventListener("change", () => saveState());
    document.getElementById("print-doc")?.addEventListener("click", () => {
      const currentId = document.getElementById("doc-form")?.dataset.editingId;
      const targetDoc =
        state.documents.find((d) => d.id === currentId) || state.documents[state.documents.length - 1];
      if (!targetDoc) {
        alert("Aucun document à imprimer. Créez ou sélectionnez un devis/facture.");
        return;
      }
      renderDocPreview(targetDoc);
      setActivePanel("documents");
      applyPrintClass("document");
      triggerPrint("document");
    });
  }

  // -----------------------------
  // Pieces, import/export events
  // -----------------------------
  function setupPieceEvents() {
    document.getElementById("piece-form")?.addEventListener("submit", handlePieceSubmit);
    document.getElementById("piece-preview-grid")?.addEventListener("click", handlePieceActions);
    setupPiecePreviewToggle();
  }

  function setupImportExport() {
    document
      .getElementById("signature-input")
      ?.addEventListener("change", (e) => handleFileInput(e.target, "signature"));
    document.getElementById("print-week")?.addEventListener("click", () => triggerPrint("journal"));
    document.getElementById("print-fuel")?.addEventListener("click", () => triggerPrint("pieces"));
    document.getElementById("import-input")?.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        importData(file);
        event.target.value = "";
      }
    });
    document.getElementById("reset-data")?.addEventListener("click", () => {
      if (confirm(getText("prompts.resetConfirm", "Supprimer toutes les données du dossier et recommencer ?"))) {
        resetState();
      }
    });
  }

  // -----------------------------
  // Company events
  // -----------------------------
  function setupCompanyEvents() {
    document
      .querySelectorAll(
        "#company-legal-name, #company-status, #company-siren, #company-vat, #company-phone, #company-email, #company-address, #company-iban"
      )
      .forEach((input) => input.addEventListener("input", handleCompanyInput));
    document.getElementById("company-micro-exempt")?.addEventListener("change", handleCompanyInput);
    document.getElementById("company-logo")?.addEventListener("change", handleCompanyLogo);
  }

  // -----------------------------
  // PWA
  // -----------------------------
  const IOS_HINT_DISMISSED_KEY = CONFIG.pwa?.iosHintStorageKey || "iosA2hsHintDismissed";
  let deferredInstallPrompt = null;

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => console.error("SW registration failed:", error));
    });
  }

  function initPwaFeatures() {
    const installButton = document.getElementById("btn-install");
    const iosHint = document.getElementById("ios-a2hs-hint");
    const iosHintClose = iosHint?.querySelector("[data-ios-hint-close]");
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isInStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

    registerServiceWorker();

    if (iosHint && isIos && !isInStandaloneMode && !localStorage.getItem(IOS_HINT_DISMISSED_KEY)) {
      iosHint.hidden = false;
    }

    iosHintClose?.addEventListener("click", () => {
      iosHint.hidden = true;
      localStorage.setItem(IOS_HINT_DISMISSED_KEY, "1");
    });

    if (isIos) {
      if (installButton) {
        installButton.hidden = !!isInStandaloneMode;
        installButton.addEventListener("click", (event) => {
          event.preventDefault();
          if (iosHint) {
            iosHint.hidden = false;
            iosHint.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            alert(
              getText(
                "pwa.iosAlert",
                "Sur iOS, utilisez le menu Partager puis « Sur l'écran d'accueil »."
              )
            );
          }
        });
      }
      return;
    }

    if (installButton && isInStandaloneMode) {
      installButton.hidden = true;
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (installButton && !isInStandaloneMode) {
        installButton.hidden = false;
      }
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      if (installButton) installButton.hidden = true;
    });

    installButton?.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      const result = await deferredInstallPrompt.prompt();
      deferredInstallPrompt = null;
      if (installButton) {
        installButton.hidden = true;
      }
      if (result?.outcome) {
        localStorage.setItem("a2hsPromptOutcome", result.outcome);
      }
    });
  }

  // -----------------------------
  // Init
  // -----------------------------
  function renderAll() {
    renderEntryTables();
    renderDashboard();
    renderContactLists();
    renderQuickCommPanel();
    renderPieces();
    renderDocTable();
    if (state.documents.length) {
      renderDocPreview(state.documents[state.documents.length - 1]);
    }
    renderMicroPayments();
    renderMicro();
    renderExpenseCalendar();
    renderPreview();
  }

  function init() {
    applyThemeColors();
    applyBranding();
    applyTextPlaceholders();
    renderInstructionSections();
    populateForms();
    syncAllDocsToEntries();
    setupCollapsibleSections();
    attachNavigation();
    setupFilters();
    setupCalendarEvents();
    setupTablesActions();
    setupPiecePreviewToggle();
    setupSaveLoadButtons();
    setupAmountAutoCalc();
    setupResetButtons();
    renderDocLines();
    setupDocEvents();
    setupPieceEvents();
    setupImportExport();
    setupMicroPaymentEvents();
    setupCompanyEvents();
    setupQuickComm();
    setupTopNav();
    setupInfoScrollShortcut();
    setupPageTransitions();

    document
      .querySelectorAll("#company-name, #dossier-title, #period-start, #period-end, #currency, #observations")
      .forEach((input) => input.addEventListener("input", handleMetaInput));

    document.getElementById("income-form")?.addEventListener("submit", handleEntryFormSubmit);
    document.getElementById("expense-form")?.addEventListener("submit", handleEntryFormSubmit);
    document.getElementById("client-form")?.addEventListener("submit", handleContactSubmit);
    document.getElementById("fournisseur-form")?.addEventListener("submit", handleContactSubmit);
    document.getElementById("client-list")?.addEventListener("click", handleContactListClick);
    document.getElementById("fournisseur-list")?.addEventListener("click", handleContactListClick);

    document.getElementById("add-expense-category")?.addEventListener("click", () => {
      addExpenseCategory(document.getElementById("new-expense-category")?.value);
    });
    document.getElementById("add-payment-method")?.addEventListener("click", () => {
      addPaymentMethod(document.getElementById("new-payment-method")?.value);
    });
    document.getElementById("add-income-category")?.addEventListener("click", () => {
      addIncomeCategory(document.getElementById("new-income-category")?.value);
    });
    document.getElementById("add-income-payment")?.addEventListener("click", () => {
      addPaymentMethod(document.getElementById("new-income-payment-method")?.value);
    });
    document.getElementById("remove-income-category")?.addEventListener("click", () => {
      const value = document.getElementById("income-category-manage")?.value;
      removeIncomeCategory(value);
    });
    document.getElementById("remove-expense-category")?.addEventListener("click", () => {
      const value = document.getElementById("expense-category-manage")?.value;
      removeExpenseCategory(value);
    });
    document.getElementById("remove-income-payment")?.addEventListener("click", () => {
      const value = document.getElementById("income-payment-manage")?.value;
      removePaymentMethod(value);
    });
    document.getElementById("remove-expense-payment")?.addEventListener("click", () => {
      const value = document.getElementById("expense-payment-manage")?.value;
      removePaymentMethod(value);
    });

    document.addEventListener("beforeprint", () => {
      const activeBtn = document.querySelector(".tabs button.active, .sidebar-nav button.active");
      const target = activeBtn?.dataset.target;
      if (target === "pieces") applyPrintClass("pieces");
      else if (target === "documents") applyPrintClass("document");
      else applyPrintClass("journal");
    });
    document.addEventListener("afterprint", () => {
      document.body.classList.remove(PRINT_JOURNAL_CLASS, PRINT_PIECES_CLASS, PRINT_DOC_CLASS);
      resetPanelDisplay();
    });

    updatePeriodSummary();
    renderAll();
  }

  function handleMetaInput(event) {
    const { id, value } = event.target;
    if (id === "company-name") state.meta.company = value;
    if (id === "dossier-title") state.meta.dossierTitle = value;
    if (id === "period-start") state.meta.periodStart = value;
    if (id === "period-end") state.meta.periodEnd = value;
    if (id === "currency") state.meta.currency = value || "EUR";
    if (id === "observations") state.meta.observations = value;
    updatePeriodSummary();
    saveState();
  }

  /*
   * Guide d'utilisation du template
   * 1. Copiez le dossier pour démarrer un nouveau projet local de comptabilité.
   * 2. Remplacez les logos/icônes (branding.*, icons/...) et adaptez APP_CONFIG dans config.js.
   * 3. Ajoutez vos catégories, taux de TVA, moyens de paiement dans APP_CONFIG.accounting.
   * 4. Exportez régulièrement en JSON et stockez vos pièces dans un dossier dédié.
   * 5. Adaptez service-worker.js si vous ajoutez/supprimez des fichiers à mettre en cache.
   */

  document.addEventListener("DOMContentLoaded", () => {
    init();
    initPwaFeatures();
  });
})();
