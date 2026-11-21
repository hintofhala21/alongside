"use strict";

const languageStorageKey = "alongside-interface-language";
const languageRegistry = JSON.parse(document.getElementById("language-registry").textContent);
const arabicInterface = JSON.parse(document.getElementById("arabic-interface").textContent);
const languageCodes = new Set(languageRegistry.map(([code]) => code));
const languageAliases = new Map();
const languageLabels = new Map();
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
let selectedLanguage = "en";
let translationObserver;

function interfaceLocale() {
  return selectedLanguage.split("-")[0] === "ar" ? "ar" : "en";
}

function normalizeLanguageName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

for (const [code, name, aliases] of languageRegistry) {
  for (const alias of [code, name, ...aliases]) languageAliases.set(normalizeLanguageName(alias), code);
}
languageAliases.set("العربية", "ar");
languageAliases.set("الإنجليزية", "en");

function resolveLanguage(value) {
  const normalized = normalizeLanguageName(value);
  if (languageLabels.has(normalized)) return languageLabels.get(normalized);
  if (languageAliases.has(normalized)) return languageAliases.get(normalized);
  const code = value.match(/\(([^()]+)\)$/)?.[1] ?? value.trim();
  try {
    const canonical = Intl.getCanonicalLocales(code)[0];
    return canonical && languageCodes.has(canonical.split("-")[0]) ? canonical : null;
  } catch { return null; }
}

function readLanguagePreference() {
  try {
    return resolveLanguage(localStorage.getItem(languageStorageKey) || profile?.language || "en") ?? "en";
  } catch { return resolveLanguage(profile?.language || "en") ?? "en"; }
}

function languageName(code) {
  try {
    const name = new Intl.DisplayNames([interfaceLocale()], { type: "language" }).of(code);
    if (name && name !== code) return name;
  } catch {}
  return languageRegistry.find(([languageCode]) => languageCode === code)?.[1] ?? code;
}

function languageChoice(code) {
  return languageName(code) + " (" + code + ")";
}

function populateLanguageOptions(query = "") {
  const normalized = normalizeLanguageName(query);
  const preferred = ["en", "ar", "es", "fr", "de", "hi", "ur", "zh", "ja", "ko", "pt", "ru", "tr", "fa", "bn", "id", "sw", "tl", "ta"];
  const rows = normalized
    ? languageRegistry.filter(([code, name, aliases]) => [code, name, ...aliases].some((item) => normalizeLanguageName(item).includes(normalized))).slice(0, 50)
    : preferred.map((code) => languageRegistry.find((row) => row[0] === code)).filter(Boolean);
  const list = document.getElementById("language-options");
  list.replaceChildren();
  for (const [code] of rows) {
    const option = document.createElement("option");
    option.value = languageChoice(code);
    languageLabels.set(normalizeLanguageName(option.value), code);
    list.append(option);
  }
}

function translate(text) {
  if (interfaceLocale() === "en") return text;
  if (Object.hasOwn(arabicInterface, text)) return arabicInterface[text];
  const question = text.match(/^Question (\d+) \/ (\d+)$/);
  if (question) return "السؤال \u2066" + question[1] + " / " + question[2] + "\u2069";
  const welcome = text.match(/^Welcome, (.+)\.$/);
  if (welcome) return arabicInterface["Welcome, {name}."].replace("{name}", welcome[1]);
  const count = text.match(/^(\d+) specific pages approved for Alongside’s information library\.$/);
  if (count) return count[1] + " صفحات محددة معتمدة لمكتبة معلومات Alongside.";
  const chat = text.match(/^Sample chat (\d+) · (.+)$/);
  if (chat) return "محادثة توضيحية " + chat[1] + " · " + translate(chat[2]);
  const remove = text.match(/^Delete check-in (\d+)$/);
  if (remove) return "حذف التسجيل " + remove[1];
  for (const suffix of [" reminder seen", " reminder marked as seen.", " reminder unmarked."]) {
    if (text.endsWith(suffix)) return translate(text.slice(0, -suffix.length)) + " · " + translate(suffix.trim());
  }
  if (text.includes(" · ")) return text.split(" · ").map(translate).join(" · ");
  return text;
}

function translateView() {
  translationObserver?.disconnect();
  const locale = interfaceLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest("script, style, textarea, datalist, [data-user-content]")) continue;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const original = originalText.get(node);
    const content = original.trim();
    if (!content) continue;
    const translated = original.replace(content, translate(content));
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }
  for (const element of document.querySelectorAll("[aria-label], [placeholder]")) {
    let attributes = originalAttributes.get(element);
    if (!attributes) {
      attributes = {};
      originalAttributes.set(element, attributes);
    }
    for (const attribute of ["aria-label", "placeholder"]) {
      if (!element.hasAttribute(attribute)) continue;
      attributes[attribute] ??= element.getAttribute(attribute);
      const text = translate(attributes[attribute]);
      if (element.getAttribute(attribute) !== text) element.setAttribute(attribute, text);
    }
  }
  const page = location.hash.slice(1);
  document.title = translate(pageNames[page] ?? "Profile") + " · Alongside";
  translationObserver?.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function refreshLanguage() {
  for (const id of ["preferred-language", "dialog-language"]) {
    document.getElementById(id).value = languageChoice(selectedLanguage);
    document.getElementById(id).setCustomValidity("");
  }
  populateLanguageOptions();
  const notice = document.getElementById("language-notice");
  const available = ["en", "ar"].includes(selectedLanguage.split("-")[0]);
  notice.hidden = available;
  notice.textContent = available ? "" : "Preferred language: " + languageName(selectedLanguage) + ". This preview currently shows its interface in English until that translation is added.";
  if (profile) {
    renderToday();
    renderPlan();
    renderChat();
    renderHistory();
    renderReminders();
  }
  prepareCountryOptions();
  renderLearning();
  if (profile) { renderTasks(); renderDailyPrompt(); }
  renderSources();
  translateView();
}

function useLanguage(code) {
  selectedLanguage = code;
  let saved = true;
  try { localStorage.setItem(languageStorageKey, code); } catch { saved = false; }
  refreshLanguage();
  return saved;
}

function chooseLanguage(inputId, statusId) {
  const input = document.getElementById(inputId);
  const code = resolveLanguage(input.value);
  if (!code) {
    input.setCustomValidity(translate("Choose a language from the suggestions or enter its language code."));
    input.reportValidity();
    return false;
  }
  if (profile) {
    profile.language = code;
    if (!persist()) {
      document.getElementById(statusId).textContent = "Your language couldn’t be saved. Please try again.";
      return false;
    }
  }
  const saved = useLanguage(code);
  document.getElementById(statusId).textContent = saved ? "Language saved." : "Language changed for this visit. Browser storage is unavailable.";
  return true;
}

function initializeLanguageControls() {
  for (const id of ["preferred-language", "dialog-language"]) {
    document.getElementById(id).addEventListener("input", (event) => {
      event.target.setCustomValidity("");
      populateLanguageOptions(event.target.value);
    });
    document.getElementById(id).addEventListener("focus", () => populateLanguageOptions());
  }
  document.getElementById("apply-profile-language").addEventListener("click", () => {
    chooseLanguage("preferred-language", "language-status");
  });
  document.getElementById("open-language").addEventListener("click", () => {
    document.getElementById("dialog-language").value = languageChoice(selectedLanguage);
    document.getElementById("dialog-language-status").textContent = "";
    populateLanguageOptions();
    document.getElementById("language-dialog").showModal();
  });
  document.getElementById("cancel-language").addEventListener("click", () => document.getElementById("language-dialog").close());
  document.getElementById("language-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (chooseLanguage("dialog-language", "dialog-language-status")) document.getElementById("language-dialog").close();
  });
  translationObserver = new MutationObserver(translateView);
  refreshLanguage();
}


const { medicalSources, medicalAnswers, uncoveredAnswer } = globalThis.AlongsideLibrary;

const stages = {
  start: {
    label: "Getting started",
    focus: "Choose one thing you’d like your team to understand about mealtimes.",
    practice: "Keep the support note handy so it’s easy to find when you need it.",
    next: "Try writing one question to bring to the next appointment."
  },
  routine: {
    label: "Finding a routine",
    focus: "Notice what helps when the day gets busy.",
    practice: "Take a moment to notice what kind of support felt helpful today.",
    next: "Bring an example of a busy day to your team and talk through what would help."
  },
  continue: {
    label: "Keeping support in place",
    focus: "Think through who you can reach out to when plans change.",
    practice: "Keep a trusted support person’s contact information somewhere easy to find.",
    next: "Write down one kind of support you’d like to keep in place."
  }
};
const mealSlots = [
  { id: "breakfast", name: "Breakfast", time: "08:00", kind: "meals" },
  { id: "morning", name: "Morning snack", time: "10:30", kind: "snacks" },
  { id: "lunch", name: "Lunch", time: "12:30", kind: "meals" },
  { id: "afternoon", name: "Afternoon snack", time: "15:30", kind: "snacks" },
  { id: "dinner", name: "Dinner", time: "18:30", kind: "meals" },
  { id: "evening", name: "Evening snack", time: "20:30", kind: "snacks" }
];
const defaultWindow = { start: "09:00", end: "21:00" };
const byId = (id) => document.getElementById(id);
const storageKey = "stillday-profile-v2";
const legacyStorageKey = "stillday-demo-v1";
const defaultNote = "You can use a check-in to write down what you’d like to discuss with your support team.";
const settings = ["enabled", "meals", "snacks", "water", "discreet"];
const ageGroups = ["child", "teen", "adult"];
let profile = null;
let data = emptyData();
let previewIndex = 0;
let showTestPreview = false;
let feeling = "";
let conversationState = { recent: [], current: null };
let chatController;

function emptyData() {
  return {
    checkins: [],
    tasks: [],
    checkinKind: "meals",
    checkinTime: "20:00",
    settings: { enabled: false, meals: true, snacks: true, water: false, discreet: true }
  };
}

function readProfile() {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (!saved?.profile || typeof saved.profile.id !== "string") return null;
  const oldFields = ["height", "heightUnit", "weight", "weightUnit"];
  const hadMeasurements = oldFields.some(key => Object.hasOwn(saved.profile, key));
  for (const key of oldFields) delete saved.profile[key];
  if (hadMeasurements) { try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch {} }
  return saved;
}

function loadProfile() {
  let saved;
  try { saved = readProfile(); } catch { saved = null; }
  profile = saved?.profile ?? null;
  data = Object.assign(emptyData(), saved?.data);
  data.settings = Object.assign(emptyData().settings, saved?.data?.settings);
  data.settings.meals = true;
  data.checkins = Array.isArray(data.checkins) ? data.checkins : [];
  data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  conversationState = { recent: [], current: null };
}

loadProfile();
selectedLanguage = readLanguagePreference();

function record() {
  return data;
}

function hasAgeGroup() {
  return ageGroups.includes(profile?.ageGroup);
}

function persist() {
  try {
    const stored = readProfile();
    if (!profile || stored?.profile.id !== profile.id) {
      syncProfile();
      return false;
    }
    data.settings.meals = true;
    localStorage.setItem(storageKey, JSON.stringify({ profile, data }));
    return true;
  } catch { return false; }
}

function activeEatingSlots() {
  return mealSlots.filter((slot) => slot.kind === "meals" || record().settings.snacks !== false);
}

function schedule() {
  const slots = activeEatingSlots().map((slot) => ({
    ...slot,
    time: record().times?.[slot.id] ?? slot.time
  }));
  if (record().settings.water) slots.push({ id: "water", name: "Water reminder", time: "16:15", kind: "water" });
  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

function formatTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(interfaceLocale(), { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}

function reviews() {
  const day = dayKey();
  if (record().reviews?.day !== day) record().reviews = { day, seen: [] };
  return record().reviews.seen;
}

function nextReminder(items = schedule()) {
  const seen = reviews();
  return items.find((item) => !seen.includes(item.id));
}

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}

function scheduleList(items, next, reviewable = false) {
  const list = element("ul", "", "timeline");
  for (const item of items) {
    const row = element("li", "", item.id === next?.id ? "current" : "");
    const icon = element("span", "", "tile-icon");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", item.kind === "water" ? "#drop" : "#meal");
    svg.append(use);
    icon.append(svg);
    const copy = element("div", "", "entry-copy");
    copy.append(element("span", item.name, "entry-name"));
    if (item.food) copy.append(element("small", item.food));
    copy.append(element("small", formatTime(item.time)));
    row.append(icon, copy);
    if (item.id === next?.id) row.setAttribute("aria-current", "true");
    if (reviewable) {
      const label = element("label", "", "review-control");
      const checkbox = element("input", "");
      checkbox.type = "checkbox";
      checkbox.dataset.review = item.id;
      checkbox.checked = reviews().includes(item.id);
      checkbox.setAttribute("aria-label", item.name + " reminder seen");
      label.append(checkbox, document.createTextNode("Seen"));
      row.append(label);
    }
    list.append(row);
  }
  return list;
}

function renderToday() {
  const items = schedule();
  const upcoming = nextReminder(items);
  byId("today-date").textContent = new Intl.DateTimeFormat(interfaceLocale(), { timeZone: zone(), weekday: "long", month: "long", day: "numeric" }).format(new Date()) + " · Your schedule";
  byId("next-title").textContent = upcoming?.name ?? "Reminders reviewed";
  byId("next-time").textContent = upcoming ? formatTime(upcoming.time) + " · Sample reminder" : "Open the full plan to revisit the sample day.";
  byId("acknowledge").hidden = !upcoming;
  renderDailyPrompt();
  const groups = [["Meals", "meals"], ["Snacks", "snacks"], ["Water", "water"]];
  byId("today-schedule").replaceChildren(...groups.filter(([, kind]) => kind !== "snacks" || record().settings.snacks !== false).map(([title, kind]) => {
    const group = element("section", "", "section-group");
    const slots = items.filter((item) => item.kind === kind);
    group.append(element("h3", title));
    group.append(slots.length
      ? scheduleList(slots, upcoming, true)
      : element("p", "Water reminders are off. You can turn on a sample reminder in Reminders.", "muted"));
    return group;
  }));
  byId("brief-reminder").textContent = record().settings.enabled ? "Reminder previews are enabled." : "Preview a discreet reminder message.";
}

function renderPlan() {
  if (!profile) return;
  renderRecoveryFocus();
  const stage = Object.hasOwn(stages, profile.stage) ? stages[profile.stage] : stages.start;
  byId("stage-label").textContent = profile.stage ? stage.label : "Your schedule and support";
  byId("weekly-focus").textContent = stage.focus;
  byId("gentle-step").textContent = stage.next;
  byId("daily-practices").replaceChildren(
    element("li", stage.practice),
    element("li", "Use a check-in to make a note for your next appointment if something is on your mind.")
  );
  byId("plan-schedule").replaceChildren(scheduleList(schedule()));
  renderCareNotes();
}


function sourceLinks(sourceIds) {
  const links = element("div", "", "source-links");
  links.setAttribute("aria-label", "Sources for this answer");
  for (const id of sourceIds) {
    const source = medicalSources[id];
    const link = element("a", source.organization);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    links.append(link);
  }
  return links;
}

function renderSources() {
  const list = byId("approved-sources");
  list.replaceChildren();
  byId("sources-summary").textContent = Object.keys(medicalSources).length + " specific pages approved for Alongside’s information library.";
  for (const [id, source] of Object.entries(medicalSources)) {
    const section = element("section", "", "panel stack");
    section.append(
      element("h2", source.organization),
      element("small", source.region),
      element("p", source.scope),
      sourceLinks([id])
    );
    const link = section.querySelector("a");
    link.textContent = source.title;
    list.append(section);
  }
}

function renderChat() { chatController?.render(); }
function sendApproved(message, answerId) { chatController?.sendApproved(message, answerId); }

function renderHistory() {
  const history = byId("checkin-history");
  history.replaceChildren();
  if (record().checkins.length === 0) {
    history.append(element("p", "Your saved reflections will appear here.", "muted"));
    return;
  }
  const list = element("ul", "", "entries");
  for (const [index, entry] of record().checkins.entries()) {
    const item = element("li", "");
    const head = element("div", "", "entry-head");
    const remove = element("button", "Delete", "delete");
    remove.type = "button";
    remove.setAttribute("aria-label", "Delete check-in " + (index + 1));
    remove.addEventListener("click", () => {
      record().checkins.splice(index, 1);
      const stored = persist();
      renderHistory();
      byId("checkin-status").textContent = stored ? "Check-in deleted." : "Check-in removed for this visit.";
      renderDailyPrompt();
      byId("guided-title").focus();
    });
    head.append(element("strong", entry.guided ? "Daily check-in" : entry.feeling || "Reflection"), remove);
    const shownDate = entry.day && /^\d{4}-\d{2}-\d{2}$/.test(entry.day) ? new Intl.DateTimeFormat(interfaceLocale(), {timeZone:"UTC",month:"short",day:"numeric",year:"numeric"}).format(new Date(entry.day+"T12:00:00Z")) : entry.date;
    item.append(head, element("small", shownDate));
    if (entry.guided) {
      for (const slot of mealSlots) {
        const value = entry.answers?.meals?.[slot.id];
        if (value) { const row = element("p", slot.name + " · " + (({had:"I had this",difficult:"It felt difficult",missed:"It didn’t happen",skip:"Prefer not to answer"})[value] || "")); item.append(row); }
      }
      for (const key of ["experience", "fluids", "support"]) if (entry.answers?.[key]) {
        item.append(element("strong", ({experience:"What was eating like?",fluids:"Fluids and comfort",support:"What would help next?"})[key]),userText("p",entry.answers[key]));
      }
      item.append(userText("small", entry.timeZone || ""));
    }
    if (entry.note) {
      const note = element("p", entry.note);
      note.dataset.userContent = "";
      item.append(note);
    }
    list.append(item);
  }
  history.append(list);
}

function renderTimeFields() {
  const items = schedule();
  const fields = activeEatingSlots().map((slot) => {
    const field = element("label", slot.name, "field");
    const input = element("input", "");
    input.type = "time";
    input.required = true;
    input.name = slot.id;
    input.value = items.find((item) => item.id === slot.id).time;
    field.append(input);
    return field;
  });
  byId("meal-times").replaceChildren(...fields);
  const window = record().waterWindow ?? defaultWindow;
  byId("water-start").value = window.start;
  byId("water-end").value = window.end;
  const hasWater = record().settings.water;
  byId("water-window").hidden = !hasWater;
  byId("water-window").disabled = !hasWater;
}

function withinWaterWindow(time) {
  const { start, end } = record().waterWindow ?? defaultWindow;
  return start < end ? time >= start && time <= end : time >= start || time <= end;
}

function renderReminders() {
  const choices = record().settings;
  choices.meals = true;
  const waterTime = record().settings.water ? "16:15" : null;
  byId("water-settings-note").textContent = !waterTime
    ? "Water reminders are off. You can turn on a sample reminder in Reminders."
    : withinWaterWindow(waterTime) ? "" : "The sample water reminder is outside the preview window.";
  for (const key of settings) {
    const unavailable = key === "water" && !waterTime;
    byId(key).checked = !unavailable && choices[key];
    byId(key).disabled = key === "meals";
  }
  const items = schedule().filter((item) => (item.kind === "meals" || choices[item.kind]) && (item.kind !== "water" || withinWaterWindow(item.time)));
  const selected = items.length ? items[previewIndex % items.length] : null;
  const messagePreview = byId("message-preview");
  messagePreview.replaceChildren();
  const canPreview = (choices.enabled || showTestPreview) && Boolean(selected);
  byId("test-preview").disabled = !selected;
  byId("advance-preview").disabled = !canPreview || items.length < 2;
  if (!canPreview) {
    messagePreview.textContent = selected ? "Try a test nudge or enable reminder previews." : "Choose an available reminder type to see a preview.";
    return;
  }
  messagePreview.append(
    element("strong", (showTestPreview ? "Test nudge · " : "Alongside · ") + formatTime(selected.time)),
    element("p", choices.discreet ? "Your next reminder is ready. Open Alongside to view it." : "A reminder from your sample plan · " + selected.name + ".")
  );
}

function resetTransientState() {
  byId("recovery-dialog").close();
  byId("recovery-update-form").reset();
  byId("recovery-description").value = "";
  byId("recovery-update-status").textContent = "";
  byId("recovery-save-status").textContent = "";
  byId("recovery-focus").textContent = "";
  feeling = "";
  previewIndex = 0;
  showTestPreview = false;
  conversationState = { recent: [], current: null };
  for (const id of ["checkin-form", "chat-form", "learn-form", "times-form"]) byId(id).reset();
  for (const button of document.querySelectorAll("[data-feeling]")) button.setAttribute("aria-pressed", "false");
  for (const id of ["today-status", "checkin-status", "plan-status", "times-status"]) byId(id).textContent = "";
  byId("conversation").replaceChildren();
  byId("recent-chats").replaceChildren();
  byId("checkin-history").replaceChildren();
  resetGuided();
  for (const id of ["task-form", "whatsapp-form", "checkin-preferences", "care-form"]) byId(id).reset();
  for (const id of ["task-status", "whatsapp-status", "calendar-status", "checkin-preferences-status"]) byId(id).textContent = "";
  byId("task-list").replaceChildren();
  byId("task-custom-field").hidden = true;
  byId("task-custom").required = false;
  byId("care-results").replaceChildren();
  byId("daily-prompt").hidden = true;
  byId("profile-letter").textContent = "";
  byId("profile-name").textContent = "Profile";
  byId("today-title").textContent = "Welcome.";
  byId("today-date").textContent = "";
  byId("next-title").textContent = "";
  byId("next-time").textContent = "";
  for (const id of ["today-schedule", "stage-label", "support-note", "weekly-focus", "gentle-step", "daily-practices", "plan-schedule", "meal-times", "message-preview"]) byId(id).replaceChildren();
}

function renderProfile() {
  byId("workspace-nav").hidden = false;
  byId("profile-link").hidden = !profile;
  byId("delete-section").hidden = !profile;
  byId("settings-empty").hidden = Boolean(profile);
  for (const button of document.querySelectorAll("[data-update-recovery]")) button.hidden = !profile;
  byId("settings-profile").textContent = profile ? "Edit profile" : "Set up your profile";
  byId("profile-title").textContent = profile ? "Your profile" : "Set up your profile";
  byId("profile-intro").textContent = !profile
    ? "Choose how Alongside greets you and where you’d like to start."
    : hasAgeGroup()
      ? "Update your profile details and recovery stage."
      : "Add your age group to finish setting up your profile.";
  byId("save-profile").textContent = profile ? "Save profile" : "Create profile";
  byId("nickname").value = profile?.name ?? "";
  byId("age-group").value = hasAgeGroup() ? profile.ageGroup : "";
  byId("recovery-stage").value = profile?.stage ?? "";
  byId("preferred-language").value = languageChoice(selectedLanguage);
  populateProfileExtras();
  renderHelp();
  if (!profile) return;
  byId("profile-letter").textContent = (Array.from(profile.name)[0] ?? "S").toUpperCase();
  byId("profile-name").toggleAttribute("data-user-content", Boolean(profile.name));
  byId("profile-name").textContent = profile.name || "Your profile";
  byId("today-title").textContent = profile.name ? "Welcome, " + profile.name + "." : "Welcome.";
  byId("support-note").textContent = defaultNote;
  renderToday();
  renderPlan();
  renderChat();
  renderHistory();
  renderTimeFields();
  renderReminders();
}

const pageNames = { profile: "Profile", today: "Today", plan: "My plan", support: "Chat with Alongside", checkins: "Check-ins", reminders: "Reminders", sources: "Medical sources", settings: "Settings", care: "Find care", learn: "Learn" };
function renderRoute(moveFocus) {
  const requested = location.hash.slice(1);
  document.querySelector(".sidebar").classList.remove("menu-open");
  byId("toggle-menu").setAttribute("aria-expanded", "false");
  const openPages = ["support", "profile", "sources", "settings", "care", "learn"];
  const page = !requested ? "support" : openPages.includes(requested) ? requested : hasAgeGroup() ? (Object.hasOwn(pageNames, requested) ? requested : "support") : "profile";
  if (location.hash !== "#" + page) history.replaceState(null, "", "#" + page);
  for (const section of document.querySelectorAll("[data-page]")) section.hidden = section.dataset.page !== page;
  for (const link of document.querySelectorAll(".nav a")) {
    if (link.hash === "#" + page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (page === "profile") byId("profile-link").setAttribute("aria-current", "page");
  else byId("profile-link").removeAttribute("aria-current");
  if (page === "settings") byId("settings-link").setAttribute("aria-current", "page");
  else byId("settings-link").removeAttribute("aria-current");
  byId("section-label").textContent = pageNames[page];
  document.body.classList.toggle("chat-view", page === "support");
  for (const link of document.querySelectorAll(".mobile-dock a")) { if (link.hash === "#" + page) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); }
  if (page === "support") renderChat();
  if (page === "today") { renderToday(); renderTasks(); }
  if (page === "care") renderCare();
  if (page === "learn") renderLearning();
  document.title = translate(pageNames[page]) + " · Alongside";
  if (moveFocus) {
    window.scrollTo(0, 0);
    document.querySelector("[data-page=" + page + "] h1").focus({ preventScroll: true });
  }
}

function syncProfile() {
  loadProfile();
  selectedLanguage = readLanguagePreference();
  resetTransientState();
  byId("delete-dialog").close();
  byId("reset-dialog").close();
  byId("language-dialog").close();
  byId("recovery-dialog").close();
  byId("profile-status").textContent = "Your profile was changed in another tab.";
  renderProfile();
  renderRoute(true);
  refreshLanguage();
}

window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) syncProfile();
  else if (event.key === languageStorageKey) {
    selectedLanguage = readLanguagePreference();
    refreshLanguage();
  }
});
window.addEventListener("hashchange", () => renderRoute(true));

byId("profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const language = resolveLanguage(byId("preferred-language").value);
  if (!language) {
    chooseLanguage("preferred-language", "language-status");
    return;
  }
  const name = byId("nickname").value.trim();
  const stage = byId("recovery-stage").value;
  const ageGroup = byId("age-group").value;
  if (!ageGroups.includes(ageGroup)) {
    byId("age-group").focus();
    return;
  }
  const extras = readProfileExtras();
  if (!extras) return;
  const completingSetup = !hasAgeGroup();
  try {
    const stored = readProfile();
    if (stored?.profile.id !== profile?.id) {
      syncProfile();
      return;
    }
    const nextProfile = { ...profile, ...extras, id: profile?.id ?? crypto.randomUUID(), name, stage, ageGroup, language };
    localStorage.setItem(storageKey, JSON.stringify({ profile: nextProfile, data }));
    localStorage.removeItem(legacyStorageKey);
    profile = nextProfile;
    useLanguage(language);
    renderProfile();
    byId("profile-status").textContent = "Profile saved.";
    if (completingSetup) location.hash = "#support";
  } catch {
    byId("profile-status").textContent = "Your profile couldn’t be saved. Allow browser storage and try again.";
  }
});

byId("settings-language").addEventListener("click", () => byId("open-language").click());

byId("open-delete").addEventListener("click", () => {
  if (!profile) { location.hash = "#profile"; return; }
  byId("settings-status").textContent = "";
  byId("delete-dialog").returnValue = "";
  byId("delete-dialog").showModal();
});

byId("delete-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue !== "delete") return;
  try {
    const stored = readProfile();
    if (stored?.profile.id !== profile?.id) {
      syncProfile();
      return;
    }
    localStorage.removeItem(legacyStorageKey);
    localStorage.removeItem(languageStorageKey);
    localStorage.removeItem(storageKey);
    chatController?.clearLocal();
  } catch {
    byId("settings-status").textContent = "Your profile couldn’t be deleted. Please try again.";
    return;
  }
  profile = null;
  selectedLanguage = "en";
  data = emptyData();
  resetTransientState();
  byId("profile-form").reset();
  byId("settings-status").textContent = "";
  byId("language-status").textContent = "";
  byId("profile-status").textContent = "Profile deleted. You can start fresh here.";
  renderProfile();
  history.replaceState(null, "", "#profile");
  renderRoute(true);
  refreshLanguage();
});

function setReviewed(item, seen) {
  const items = reviews();
  if (seen && !items.includes(item.id)) items.push(item.id);
  if (!seen && items.includes(item.id)) items.splice(items.indexOf(item.id), 1);
  persist();
  renderToday();
  byId("today-status").textContent = item.name + (seen ? " reminder marked as seen." : " reminder unmarked.");
}

byId("acknowledge").addEventListener("click", () => {
  const item = nextReminder();
  if (!item) return;
  setReviewed(item, true);
  if (!nextReminder()) byId("today-title").focus({ preventScroll: true });
});

byId("today-schedule").addEventListener("change", (event) => {
  const id = event.target.dataset.review;
  if (!id) return;
  const item = schedule().find((slot) => slot.id === id);
  setReviewed(item, event.target.checked);
  byId("today-schedule").querySelector('[data-review="' + id + '"]')?.focus({ preventScroll: true });
});

byId("open-reset").addEventListener("click", () => {
  byId("reset-dialog").returnValue = "";
  byId("reset-dialog").showModal();
});

byId("reset-dialog").addEventListener("close", (event) => {
  if (event.target.returnValue !== "reset") return;
  delete record().times;
  delete record().waterWindow;
  previewIndex = 0;
  showTestPreview = false;
  const stored = persist();
  renderToday();
  renderPlan();
  renderTimeFields();
  renderReminders();
  byId("times-status").textContent = "";
  byId("plan-status").textContent = stored ? "Reminder times reset." : "Reminder times reset for this visit.";
});

byId("chat-options").addEventListener("click", (event) => {
  const button = event.target.closest("[data-chat]");
  if (!button) return;
  void chatController.send(button.textContent, button.dataset.chat);
});

byId("learn-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const select = byId("approved-topic");
  sendApproved(select.selectedOptions[0].textContent, select.value);
});

byId("new-chat").addEventListener("click", () => chatController.newChat());
byId("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = byId("chat-message");
  const message = input.value.trim();
  if (!message) { input.focus(); return; }
  if (chatController.busy) return;
  input.value = "";
  void chatController.send(message);
});
byId("toggle-menu").addEventListener("click", () => {
  const opened = document.querySelector(".sidebar").classList.toggle("menu-open");
  byId("toggle-menu").setAttribute("aria-expanded", String(opened));
});
byId("connect-demo").addEventListener("click", () => chatController.openConnection());
byId("chat-message").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && matchMedia("(pointer: fine)").matches) { event.preventDefault(); byId("chat-form").requestSubmit(); }
});

for (const key of settings) {
  byId(key).addEventListener("change", (event) => {
    if (key === "snacks") captureGuided();
    record().settings[key] = key === "meals" ? true : event.target.checked;
    if (key !== "discreet") {
      previewIndex = 0;
      showTestPreview = false;
    }
    persist();
    renderReminders();
    renderTimeFields();
    renderToday();
    renderPlan();
    if (key === "snacks") renderGuided();
  });
}
byId("test-preview").addEventListener("click", () => {
  showTestPreview = true;
  renderReminders();
});
byId("advance-preview").addEventListener("click", () => {
  previewIndex += 1;
  renderReminders();
});

byId("times-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const hasWater = record().settings.water;
  const start = byId("water-start").value;
  const end = byId("water-end").value;
  const status = byId("times-status");
  if (hasWater && start === end) {
    status.textContent = "Choose different start and end times for the water reminder window.";
    byId("water-end").focus();
    return;
  }
  const fields = new FormData(event.currentTarget);
  record().times = { ...record().times, ...Object.fromEntries(activeEatingSlots().map((slot) => [slot.id, fields.get(slot.id)])) };
  if (hasWater) record().waterWindow = { start, end };
  previewIndex = 0;
  showTestPreview = false;
  status.textContent = persist() ? "Reminder times saved." : "Reminder times updated for this visit.";
  renderToday();
  renderPlan();
  renderReminders();
});
function renderHelp() {
  byId("adult-therapy").hidden = profile?.ageGroup !== "adult";
  byId("younger-support").hidden = !hasAgeGroup() || profile.ageGroup === "adult";
  byId("age-needed").hidden = hasAgeGroup();
}

for (const button of document.querySelectorAll("[data-help]")) {
  button.addEventListener("click", () => {
    renderHelp();
    byId("help-dialog").showModal();
  });
}
byId("therapy-profile-link").addEventListener("click", () => {
  byId("help-dialog").close();
  byId("age-group").focus();
});

const countryRegistry = JSON.parse(byId('country-registry').textContent);
const countryAliases = new Map();
const guidedState = { step: 0, answers: {}, note: '' };
const guidedSteps = [
 { title: 'Your day around food', question: 'Which eating occasions would you like to reflect on? Leave anything you prefer not to answer.', key: 'meals' },
 { title: 'What was eating like?', question: 'What felt manageable or difficult? Were you able to follow the plan agreed with your team?', key: 'experience' },
 { title: 'Fluids and comfort', question: 'How did fluids feel today? Use the guidance agreed with your clinician.', key: 'fluids' },
 { title: 'What would help next?', question: 'What support would make the next part of your day easier?', key: 'support' }
];
const careDirectories = {
 SA: [ ['Saudi Ministry of Health', 'https://www.moh.gov.sa/en/eservices/interactive-maps/pages/default.aspx', 'Search by region, city, and facility type across Saudi Arabia.'], ['Johns Hopkins Aramco Healthcare', 'https://www.jhah.com/en/contact-us/visit-us', 'Locations include Dhahran, Al-Hasa, Abqaiq, Ras Tanura, and Udhailiyah. Confirm eligibility and costs.'] ],
 US: [ ['HRSA Find a Health Center', 'https://findahealthcenter.hrsa.gov/', 'Search health centers by your location. Ask the center about available services and fees.'] ],
 GB: [ ['NHS service finder', 'https://www.nhs.uk/nhs-services/services-near-you/', 'Search NHS services in England by area. Other UK nations use their own NHS directories.'] ],
 AU: [ ['Healthdirect service finder', 'https://www.healthdirect.gov.au/australian-health-services', 'Search health services by location and service type.'] ],
 IE: [ ['HSE Find a GP', 'https://www2.hse.ie/services/find-a-gp/', 'Search by place, name, or address in Ireland.'] ],
 AE: [ ['UAE Ministry of Health and Prevention', 'https://mohap.gov.ae/en/about-us/medical-facilities-directory', 'Search the official medical facilities directory. Confirm services and eligibility.'] ]
};
function userText(tag, text) { const node = element(tag, text); node.dataset.userContent = ''; return node; }
function zone() { const value=profile?.timeZone; try { new Intl.DateTimeFormat('en', { timeZone: value || 'UTC' }); return value || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
function dayKey(date = new Date(), timeZone = zone()) { const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date); const get=t=>parts.find(p=>p.type===t).value; return get('year')+'-'+get('month')+'-'+get('day'); }
function localClock(date = new Date()) { return new Intl.DateTimeFormat('en-GB', {timeZone:zone(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date); }
function countryLabel(code) { if (!code || !countryRegistry.some(r=>r[0]===code)) return code || ''; try { return new Intl.DisplayNames([interfaceLocale()],{type:'region'}).of(code); } catch { return countryRegistry.find(r=>r[0]===code)?.[1] || code; } }
function prepareCountryOptions() {
 const list=byId('country-options'); list.replaceChildren();
 for (const [code, name] of countryRegistry) {
  const label=countryLabel(code); countryAliases.set(normalizeLanguageName(code),code); countryAliases.set(normalizeLanguageName(name),code); countryAliases.set(normalizeLanguageName(label),code);
  const option=element('option',''); option.value=label; list.append(option);
 }
}
function resolveCountry(value) { return countryAliases.get(normalizeLanguageName(value)) || value.trim().slice(0,100); }
function populateProfileExtras() {
 prepareCountryOptions();
 const values={ 'profile-country':countryLabel(profile?.country), 'profile-city':profile?.city || '', 'profile-timezone':zone(), 'diagnosis':profile?.diagnosis || 'unknown', 'diagnosis-other':profile?.diagnosisOther || '', 'care-team':profile?.careTeam || '', 'profile-gender':profile?.gender || '', 'other-needs':profile?.otherNeeds || '', 'allergies':profile?.allergies || '', 'fluid-note':profile?.fluidNote || '', 'care-plan-note':profile?.carePlanNote || '' };
 for (const [id,value] of Object.entries(values)) byId(id).value=value;
 for(const id of ['iron','zinc','vitaminD']) byId('need-'+id).checked=Boolean(profile?.needs?.includes(id));
 byId('guardian-note').hidden=byId('age-group').value!=='child';
 byId('diagnosis-other-field').hidden=byId('diagnosis').value!=='other';
 byId('care-country').value=countryLabel(profile?.country); byId('care-city').value=profile?.city || '';
 byId('whatsapp-number').value=record().whatsappNumber || '';
 byId('checkin-kind').value=record().checkinKind || 'meals'; byId('checkin-time').value=record().checkinTime || '20:00';
 byId('checkin-zone').textContent=zone();
}
function readProfileExtras() {
 const input=byId('profile-timezone');
 try { new Intl.DateTimeFormat('en',{timeZone:input.value.trim()}); input.setCustomValidity(''); } catch { input.setCustomValidity(translate('Choose a valid time zone, such as Asia/Riyadh.')); input.reportValidity(); return null; }
 return {country:resolveCountry(byId('profile-country').value),city:byId('profile-city').value.trim(),timeZone:input.value.trim(),diagnosis:byId('diagnosis').value,diagnosisOther:byId('diagnosis-other').value.trim(),careTeam:byId('care-team').value,gender:byId('profile-gender').value.trim(),needs:['iron','zinc','vitaminD'].filter(id=>byId('need-'+id).checked),otherNeeds:byId('other-needs').value.trim(),allergies:byId('allergies').value.trim(),fluidNote:byId('fluid-note').value.trim(),carePlanNote:byId('care-plan-note').value.trim()};
}
function renderCare() {
 const country=resolveCountry(byId('care-country').value); const city=byId('care-city').value.trim(); const out=byId('care-results'); out.replaceChildren();
 const context=element('div','','panel stack'); context.append(element('h2','Search your area'));
 if(country) context.append(userText('p',[city,countryLabel(country)].filter(Boolean).join(' · ')));
 context.append(element('p',byId('care-public').checked?'Ask each provider about public funding, reduced fees, and your eligibility.':'Enter your city or town in the directory you open. Alongside does not have a complete global hospital database.'));
 out.append(context);
 const rows=(careDirectories[country] || []).filter(row=>!byId('care-public').checked || country!=='SA' || row[0]!=='Johns Hopkins Aramco Healthcare');
 if(!rows.length) { const card=element('div','','panel stack'); card.append(element('h2','An official local directory is not listed yet'),element('p','Your country can still be selected. Use the WHO country directory to find your country’s health information and ask your local health authority for its service directory.')); const link=element('a','WHO country directory','action outline'); link.href='https://www.who.int/countries';link.target='_blank';link.rel='noopener noreferrer';card.append(link);out.append(card); }
 for (const [name,url,note] of rows) { const card=element('div','','panel stack'); card.append(element('h2',name),element('p',note));const a=element('a','Open official directory','action outline');a.href=url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);out.append(card); }
}
function activeGuidedSteps() { const kind=record().checkinKind || 'meals'; return guidedSteps.filter(s=>kind==='support'?s.key==='support':kind==='fluids'?['fluids','support'].includes(s.key):true); }
function captureGuided() {
 const step=activeGuidedSteps()[guidedState.step]; if(!step)return;
 if(step.key==='meals') guidedState.answers.meals=Object.fromEntries(activeEatingSlots().map(s=>[s.id,byId('check-'+s.id)?.value || '']));
 else guidedState.answers[step.key]=byId('guided-answer')?.value || '';
 if(step.key==='support') guidedState.note=byId('reflection').value;
}
function renderGuided() {
 const steps=activeGuidedSteps();guidedState.step=Math.min(guidedState.step,steps.length-1);const step=steps[guidedState.step];
 byId('guided-progress').textContent='Question '+(guidedState.step+1)+' / '+steps.length;
 byId('guided-title').textContent=step.title;byId('guided-question').textContent=step.question;
 const fields=byId('guided-fields');fields.replaceChildren();
 if(step.key==='meals') for(const slot of activeEatingSlots()) {const label=element('label',slot.name,'field');const select=element('select','');select.id='check-'+slot.id;for(const [value,text] of [['','Choose or skip'],['had','I had this'],['difficult','It felt difficult'],['missed','It didn’t happen'],['skip','Prefer not to answer']]) {const o=element('option',text);o.value=value;select.append(o);}select.value=guidedState.answers.meals?.[slot.id] || '';label.append(select);fields.append(label);}
 else {const label=element('label','Your answer (optional)','field');const text=element('textarea','');text.id='guided-answer';text.maxLength=600;text.dir='auto';text.value=guidedState.answers[step.key] || '';label.append(text);fields.append(label);}
 byId('guided-note-label').hidden=step.key!=='support';byId('reflection').value=guidedState.note;
 byId('guided-back').hidden=guidedState.step===0;byId('guided-next').textContent=guidedState.step===steps.length-1?'Save check-in':'Next';
}
function resetGuided() { guidedState.step=0;guidedState.answers={};guidedState.note='';renderGuided(); }
function saveGuided() {
 captureGuided();const entry={id:crypto.randomUUID(),day:dayKey(),timeZone:zone(),date:new Intl.DateTimeFormat(interfaceLocale(),{timeZone:zone(),month:'short',day:'numeric',year:'numeric'}).format(new Date()),guided:true,answers:JSON.parse(JSON.stringify(guidedState.answers)),note:guidedState.note.trim()};
 const currentData=record();const currentId=profile?.id;const before=currentData.checkins.slice();currentData.checkins.unshift(entry);
 if(!persist()){if(profile?.id===currentId && record()===currentData)currentData.checkins=before;byId('checkin-status').textContent='Your check-in couldn’t be saved. Please try again.';return;}
 resetGuided();renderHistory();renderDailyPrompt();byId('checkin-status').textContent='Check-in saved in this browser.';
}
function renderDailyPrompt() {
 const panel=byId('daily-prompt');panel.hidden=!profile;if(!profile)return;
 const done=record().checkins.some(c=>c.day===dayKey());const due=localClock()>=(record().checkinTime || '20:00');
 byId('daily-prompt-title').textContent=done?'Your check-in is saved':due?'Your daily check-in is ready':'A moment for your daily check-in';
 byId('daily-prompt-copy').textContent=done?'You can revisit it or add another reflection whenever you want.':'Daily check-in · '+formatTime(record().checkinTime || '20:00')+' · '+zone();
}
function renderTasks() {
 const list=byId('task-list');list.replaceChildren(); const day=dayKey();
 for(const task of record().tasks || []) {const row=element('li','','task-row'); const label=element('label','','task-label');const check=element('input','');check.type='checkbox';check.checked=task.doneDay===day;check.dataset.task=task.id;label.append(check,task.custom ? userText('span',task.text) : element('span',task.text));const remove=element('button','Remove','action outline');remove.type='button';remove.dataset.removeTask=task.id;row.append(label,remove);list.append(row);}
 byId('tasks-empty').hidden=Boolean(record().tasks?.length);
}
function linkToSource(title,url) {const a=element('a',title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function renderCareNotes() {
 const out=byId('care-plan-notes');out.replaceChildren(element('h2','Your care team notes'));
 const notes=[profile?.carePlanNote,profile?.fluidNote].filter(Boolean);for(const note of notes)out.append(userText('p',note));
 if(!notes.length)out.append(element('p','No care plan notes added yet.','muted'));
 if(profile?.allergies)out.append(element('strong','Your recorded food allergies'),userText('p',profile.allergies));
 if(profile?.needs?.length){out.append(element('h3','General food ideas for your recorded needs'),element('p','Check these ideas against your allergies and your clinician’s plan before using them.'));for(const key of profile.needs){const answer=medicalAnswers[key+'Food'];if(answer)out.append(element('h3',answer.title),element('p',answer.text),sourceLinks(answer.sources));}}
}
function renderLearning() {
 const out=byId('learn-cards');out.replaceChildren();
 for(const id of ['warningSigns','boneHealth']) {const answer=medicalAnswers[id];const card=element('section','','panel stack');card.append(element('h2',answer.title),element('p',answer.text),sourceLinks(answer.sources));out.append(card);}
 renderFoodIdeas();
}
function renderFoodIdeas() {
 const key=byId('food-topic').value;const answer=medicalAnswers[key+'Food'];const out=byId('food-ideas');out.replaceChildren(element('h3',answer.title),element('p',answer.text),sourceLinks(answer.sources));
}
function zonedToUtc(day,time,timeZone) {
 const [y,m,d]=day.split('-').map(Number);const [h,min]=time.split(':').map(Number);const target=Date.UTC(y,m-1,d,h,min);let guess=target;
 for(let i=0;i<4;i++){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const get=t=>Number(parts.find(p=>p.type===t).value);const shown=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));guess+=target-shown;}
 return new Date(guess);
}
function calendarText() {
 const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Alongside//Reminders//EN','CALSCALE:GREGORIAN'];
 const kinds=record().settings;const slots=schedule().filter(s=>(s.kind==='meals'?true:s.kind==='snacks'?kinds.snacks:kinds.water)&& (s.kind!=='water'||withinWaterWindow(s.time)));
 slots.push({id:'checkin',name:'Daily check-in',time:record().checkinTime || '20:00'});
 const today=dayKey();const base=new Date(today+'T12:00:00Z');
 for(let i=0;i<7;i++){const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);const day=d.toISOString().slice(0,10);for(const slot of slots){const start=zonedToUtc(day,slot.time,zone());if(start<new Date())continue;const title=translate(kinds.discreet?'Alongside reminder':slot.name);lines.push('BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@alongside','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(start),'DTEND:'+stamp(new Date(start.getTime()+5*60000)),'SUMMARY:'+title,'DESCRIPTION:Open Alongside for your reminder. Time zone '+zone(),'BEGIN:VALARM','TRIGGER:PT0S','ACTION:DISPLAY','DESCRIPTION:Alongside reminder','END:VALARM','END:VEVENT');}}
 lines.push('END:VCALENDAR');return lines.map(line=>/^[\x00-\x7F]*$/.test(line)?line.replace(/(.{75})(?=.)/g,'$1\r\n '):line).join('\r\n')+'\r\n';
}
function downloadFile(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function initializeFreeFeatures() {
 prepareCountryOptions();const timeList=byId('timezone-options');const zones=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):['UTC','Asia/Riyadh','America/New_York','Europe/London'];for(const tz of [...new Set(['UTC',...zones])]) {const o=element('option','');o.value=tz;timeList.append(o);}
 byId('diagnosis').addEventListener('change',()=>byId('diagnosis-other-field').hidden=byId('diagnosis').value!=='other');
 byId('age-group').addEventListener('change',()=>byId('guardian-note').hidden=byId('age-group').value!=='child');
 byId('profile-timezone').addEventListener('input',e=>e.target.setCustomValidity(''));
 byId('use-device-zone').addEventListener('click',()=>{byId('profile-timezone').value=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';byId('profile-timezone').setCustomValidity('');});
 byId('profile-care-link').addEventListener('click',()=>{byId('care-country').value=byId('profile-country').value;byId('care-city').value=byId('profile-city').value;});
 byId('care-form').addEventListener('submit',e=>{e.preventDefault();renderCare();});
 byId('food-topic').addEventListener('change',renderFoodIdeas);
 byId('checkin-preferences').addEventListener('submit',e=>{e.preventDefault();record().checkinKind=byId('checkin-kind').value;record().checkinTime=byId('checkin-time').value;const saved=persist();resetGuided();renderDailyPrompt();byId('checkin-preferences-status').textContent=saved?'Check-in preferences saved.':'Preferences could not be saved.';});
 byId('guided-back').addEventListener('click',()=>{captureGuided();guidedState.step=Math.max(0,guidedState.step-1);renderGuided();byId('guided-title').focus();});
 byId('checkin-form').addEventListener('submit',e=>{e.preventDefault();captureGuided();if(guidedState.step===activeGuidedSteps().length-1)saveGuided();else{guidedState.step++;renderGuided();byId('guided-title').focus();}});
 byId('task-type').addEventListener('change',()=>{byId('task-custom-field').hidden=byId('task-type').value!=='custom';byId('task-custom').required=byId('task-type').value==='custom';});
 byId('task-form').addEventListener('submit',e=>{e.preventDefault();const pick=byId('task-type');const text=pick.value==='custom'?byId('task-custom').value.trim():pick.value;if(!text)return;if((record().tasks || []).length>=20){byId('task-status').textContent='You can keep up to 20 daily tasks.';return;}const currentData=record();const currentId=profile?.id;const previous=currentData.tasks || [];currentData.tasks=[...previous,{id:crypto.randomUUID(),text,custom:pick.value==='custom',doneDay:''}];if(!persist()){if(profile?.id===currentId && record()===currentData)currentData.tasks=previous;byId('task-status').textContent='Your task could not be saved.';return;}e.currentTarget.reset();byId('task-custom-field').hidden=true;byId('task-custom').required=false;renderTasks();byId('task-status').textContent='Task added.';});
 byId('task-list').addEventListener('change',e=>{const task=record().tasks?.find(t=>t.id===e.target.dataset.task);if(!task)return;task.doneDay=e.target.checked?dayKey():'';persist();renderTasks();});
 byId('task-list').addEventListener('click',e=>{const id=e.target.closest('[data-remove-task]')?.dataset.removeTask;if(!id)return;record().tasks=(record().tasks || []).filter(t=>t.id!==id);persist();renderTasks();});
 byId('whatsapp-form').addEventListener('submit',e=>{e.preventDefault();const input=byId('whatsapp-number');const phone=input.value.replace(/[\s()-]/g,'');if(phone&&!/^\+[1-9]\d{6,14}$/.test(phone)){input.setCustomValidity(translate('Use an international number beginning with + and the country calling code.'));input.reportValidity();return;}record().whatsappNumber=phone;const ok=persist();byId('whatsapp-status').textContent=ok?'Number saved in this browser. WhatsApp sending is not connected.':'Your number could not be saved.';});
 byId('whatsapp-number').addEventListener('input',e=>e.target.setCustomValidity(''));
 byId('download-calendar').addEventListener('click',()=>{downloadFile('alongside-reminders.ics',calendarText(),'text/calendar;charset=utf-8');byId('calendar-status').textContent='Calendar downloaded. Import it in your calendar app and allow its reminders.';});
 populateProfileExtras();resetGuided();renderCare();renderLearning();renderTasks();renderDailyPrompt();
 setInterval(()=>{if(profile){renderDailyPrompt();renderTasks();if(location.hash==='#today')renderToday();}},60000);
}

const recoveryLabels = new Map();
function renderRecoveryFocus() {
  const node = byId('recovery-focus');
  const custom = profile?.diagnosis === 'other' && profile?.diagnosisOther;
  node.toggleAttribute('data-user-content', Boolean(custom));
  node.textContent = custom || recoveryLabels.get(profile?.diagnosis) || recoveryLabels.get('unknown') || 'I don’t know yet';
}
function openRecoveryUpdate() {
  if (!profile) { location.hash = '#profile'; return; }
  byId('recovery-type').value = recoveryLabels.has(profile.diagnosis) ? profile.diagnosis : 'unknown';
  byId('recovery-description').value = profile.diagnosisOther || '';
  byId('recovery-stage-choice').value = Object.hasOwn(stages, profile.stage) ? profile.stage : '';
  byId('recovery-description-field').hidden = byId('recovery-type').value !== 'other';
  byId('recovery-update-status').textContent = '';
  byId('recovery-dialog').showModal();
}
function saveRecoveryUpdate() {
  if (!profile) { syncProfile(); return false; }
  const previous = profile;
  const diagnosis = byId('recovery-type').value;
  const stage = byId('recovery-stage-choice').value;
  if (!recoveryLabels.has(diagnosis) || (stage && !Object.hasOwn(stages, stage))) return false;
  const next = { ...profile, diagnosis, diagnosisOther: diagnosis === 'other' ? byId('recovery-description').value.trim() : '', stage };
  profile = next;
  if (!persist()) {
    if (profile === next) profile = previous;
    byId('recovery-update-status').textContent = 'Your recovery details couldn’t be saved. Please try again.';
    return false;
  }
  renderProfile();
  byId('recovery-dialog').close();
  byId('recovery-save-status').textContent = 'Your recovery details have been updated.';
  byId('settings-status').textContent = 'Your recovery details have been updated.';
  return true;
}
function initializeRecoveryUpdate() {
  for (const [sourceId, targetId] of [['diagnosis', 'recovery-type'], ['recovery-stage', 'recovery-stage-choice']]) {
    const target = byId(targetId);
    for (const option of byId(sourceId).options) {
      const copy = element('option', option.textContent);
      copy.value = option.value;
      target.append(copy);
      if (sourceId === 'diagnosis') recoveryLabels.set(option.value, option.textContent);
    }
  }
  for (const button of document.querySelectorAll('[data-update-recovery]')) button.addEventListener('click', openRecoveryUpdate);
  byId('recovery-type').addEventListener('change', () => { byId('recovery-description-field').hidden = byId('recovery-type').value !== 'other'; });
  byId('cancel-recovery-update').addEventListener('click', () => byId('recovery-dialog').close());
  byId('recovery-update-form').addEventListener('submit', event => { event.preventDefault(); saveRecoveryUpdate(); });
}

chatController = new globalThis.AlongsideChat({
  sources: medicalSources, answers: medicalAnswers, getLanguage: () => interfaceLocale(),
  getAgeGroup: () => profile?.ageGroup, translateText: text => translate(text),
  onAction: (action) => { if (action === "human") { renderHelp(); byId("help-dialog").showModal(); } else location.hash = "#" + ({checkin:"checkins",routine:"today",care:"care",profile:"profile"}[action] || "support"); }
});
initializeRecoveryUpdate();
initializeFreeFeatures();
renderSources();
renderProfile();
renderRoute(false);
initializeLanguageControls();
