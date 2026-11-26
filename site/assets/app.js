"use strict";

const languageStorageKey = "alongside-interface-language";
const localeTools = globalThis.AlongsideLocale;
const renderTranslatedText = localeTools.makeRenderer();
let selectedLanguage = "en";
let translationObserver;

function interfaceLocale() {
  return localeTools.baseLanguage(selectedLanguage);
}

// Also used by the country picker to match names without case differences.
function normalizeLanguageName(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function readLanguagePreference() {
  let stored = profile?.language || "en";
  try { stored = localStorage.getItem(languageStorageKey) || stored; } catch {}
  try { return Intl.getCanonicalLocales(stored)[0] || "en"; } catch { return "en"; }
}

function populateLanguageOptions() {
  const locale = interfaceLocale();
  const base = new Intl.Locale(selectedLanguage).language;
  for (const id of ["preferred-language", "dialog-language"]) {
    const select = document.getElementById(id);
    select.replaceChildren();
    for (const [code, name] of Object.entries(localeTools.names)) {
      const option = new Option(name, code);
      option.lang = code === "zh" ? "zh-Hans" : code;
      option.dir = "auto";
      select.add(option);
    }
    // Preserve a previously saved preference until its owner chooses another one.
    if (!Object.hasOwn(localeTools.names, base)) {
      select.add(new Option(languageName(selectedLanguage), selectedLanguage));
      select.value = selectedLanguage;
    } else {
      select.value = locale;
    }
  }
}

function languageName(code) {
  try { return new Intl.DisplayNames([interfaceLocale()], {type:"language"}).of(code); }
  catch { return code; }
}

function translate(text) {
  return localeTools.translate(text, interfaceLocale());
}

function translateView() {
  translationObserver?.disconnect();
  const locale = interfaceLocale();
  document.documentElement.lang = locale === "zh" ? "zh-Hans" : locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  renderTranslatedText(translate);
  const page = location.hash.slice(1);
  document.title = translate(pageNames[page] ?? "Profile") + " · Alongside";
  translationObserver?.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function refreshLanguage() {
  populateLanguageOptions();
  const notice = document.getElementById("language-notice");
  const available = interfaceLocale() === selectedLanguage.split("-")[0];
  notice.hidden = available;
  notice.textContent = available ? "" : "Preferred language: " + languageName(selectedLanguage) + ". The interface will use English until this translation is available.";
  if (profile) {
    renderToday();
    renderPlan();
    renderHistory();
    renderReminders();
  }
  renderChat();
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
  const code = input.value;
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
  document.getElementById("apply-profile-language").addEventListener("click", () => {
    chooseLanguage("preferred-language", "language-status");
  });
  document.getElementById("open-language").addEventListener("click", () => {
    document.getElementById("dialog-language-status").textContent = "";
    document.getElementById("dialog-language").value = Object.hasOwn(localeTools.names, new Intl.Locale(selectedLanguage).language) ? interfaceLocale() : selectedLanguage;
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
const account = globalThis.AlongsideAccount;
const storageKey = account?.key("stillday-profile-v2") ?? "stillday-profile-v2";
const legacyStorageKey = account?.key("stillday-demo-v1") ?? "stillday-demo-v1";
const defaultNote = "You can use a check-in to write down what you’d like to discuss with your support team.";
const settings = ["inApp", "meals", "snacks", "water", "discreet"];
const ageGroups = ["child", "teen", "adult"];
let profile = null;
let data = emptyData();
let feeling = "";
let conversationState = { recent: [], current: null };
let chatController;
let calendarController;
let whatsappController;
let editingReminders=false;
let pendingAppleCheck=null;
let weekBusy = [];
let macBusy = [], macRead = 0;
const macHost = location.origin==="http://127.0.0.1:4174";

function emptyData() {
  return {
    checkins: [],
    tasks: [],
    checkinKind: "meals",
    checkinTime: "20:00",
    settings: { inApp: true, enabled: false, meals: true, snacks: true, water: false, discreet: false }
  };
}

function readProfile() {
  const saved = JSON.parse((globalThis.AlongsideAccount?.storage ?? localStorage).getItem(storageKey));
  if (!saved?.profile || typeof saved.profile.id !== "string") return null;
  const oldFields = ["height", "heightUnit", "weight", "weightUnit"];
  const hadMeasurements = oldFields.some(key => Object.hasOwn(saved.profile, key));
  for (const key of oldFields) delete saved.profile[key];
  if (hadMeasurements) { try { (globalThis.AlongsideAccount?.storage ?? localStorage).setItem(storageKey, JSON.stringify(saved)); } catch {} }
  return saved;
}

function loadProfile() {
  let saved;
  try { saved = readProfile(); } catch { saved = null; }
  profile = saved?.profile ?? null;
  if (profile?.birthDate) { const group = ageGroupFor(profile.birthDate); if (group) profile.ageGroup = group; }
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

// Age group comes from the date of birth, which never leaves this browser.
function ageGroupFor(birthDate) {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || "");
  if(!match) return null;
  const [year,month,day]=match.slice(1).map(Number);
  const born=new Date(year,month-1,day), now=new Date();
  if(born.getFullYear()!==year || born.getMonth()!==month-1 || born>now) return null;
  let age=now.getFullYear()-year;
  if(now.getMonth()<month-1 || (now.getMonth()===month-1 && now.getDate()<day)) age--;
  if(age>120) return null;
  return age<13 ? "child" : age<18 ? "teen" : "adult";
}
function localDateInput(date) { return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-"); }

function hasAgeGroup() {
  return ageGroups.includes(profile?.ageGroup);
}

function persist(updateReminders=true) {
  try {
    const stored = readProfile();
    if (!profile || stored?.profile.id !== profile.id) {
      syncProfile();
      return false;
    }
    data.settings.meals = true;
    (globalThis.AlongsideAccount?.storage ?? localStorage).setItem(storageKey, JSON.stringify({ profile, data }));
    if(updateReminders)syncReminderPlan();
    return true;
  } catch { return false; }
}

function activeEatingSlots(plan=record()) {
  return mealSlots.filter((slot) => slot.kind === "meals" || plan.settings.snacks !== false);
}

function schedule(plan=record(),date=null) {
  const slots = activeEatingSlots(plan).map((slot) => ({
    ...slot,
    time: (date && plan.macMealZone===zone() ? plan.macMeals?.[date]?.[slot.id] : null) ?? (date && plan.appleDay?.date===date && plan.appleDay.zone===zone() ? plan.appleDay.moves?.[slot.id] : null) ?? plan.times?.[slot.id] ?? slot.time
  }));
  if (plan.settings.water) slots.push({ id: "water", name: "Water reminder", time: "16:15", kind: "water" });
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

function nextReminder(items = schedule(record(),dayKey())) {
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
  const items = schedule(record(),dayKey());
  const upcoming = nextReminder(items);
  byId("today-date").textContent = new Intl.DateTimeFormat(interfaceLocale(), { timeZone: zone(), weekday: "long", month: "long", day: "numeric" }).format(new Date()) + " · Your schedule";
  byId("next-title").textContent = upcoming?.name ?? "Reminders reviewed";
  byId("next-time").textContent = upcoming ? formatTime(upcoming.time) + "" : "Open the full plan to review your routine.";
  byId("acknowledge").hidden = !upcoming;
  renderDailyPrompt();
  const groups = [["Meals", "meals"], ["Snacks", "snacks"], ["Water", "water"]];
  byId("today-schedule").replaceChildren(...groups.filter(([, kind]) => kind !== "snacks" || record().settings.snacks !== false).map(([title, kind]) => {
    const group = element("section", "", "section-group");
    const slots = items.filter((item) => item.kind === kind);
    group.append(element("h3", title));
    group.append(slots.length
      ? scheduleList(slots, upcoming, true)
      : element("p", "Water reminders are off. You can turn on water reminders in Reminders.", "muted"));
    return group;
  }));
  byId("brief-reminder").textContent = "Choose where you want to receive your reminders.";
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
  renderWeek();
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

function withinWaterWindow(time,plan=record()) {
  const { start, end } = plan.waterWindow ?? defaultWindow;
  return start < end ? time >= start && time <= end : time >= start || time <= end;
}

function renderDueReminders(now = new Date()) {
  const banner = byId("plan-reminder");
  const plan = record();
  const due = [];
  if (profile && plan.settings.inApp) {
    const day = dayKey(now);
    const time = localClock(now);
    for (const slot of schedule(plan, day)) {
      if (slot.time === time && (slot.kind !== "water" || withinWaterWindow(time))) due.push(slot.name);
    }
    if (time === checkinAt(plan, day) && !plan.checkins.some(entry => entry.day === day)) due.push("Daily check-in");
  }
  const message = due.map(translate).join(" · ");
  banner.hidden = !message;
  if (banner.textContent !== message) banner.textContent = message;
}

function renderReminders() {
  renderDueReminders();
  renderAppleReview();
  const choices = record().settings;
  choices.meals = true;
  const waterTime = record().settings.water ? "16:15" : null;
  byId("water-settings-note").textContent = !waterTime
    ? "Water reminders are off."
    : withinWaterWindow(waterTime) ? "" : "The water reminder is outside your chosen time window.";
  for (const key of settings) {
    const unavailable = key === "water" && !waterTime;
    byId(key).checked = !unavailable && choices[key];
    byId(key).disabled = key === "meals";
  }
  const day=dayKey();
  const items=schedule(record(),day).filter(item=>item.kind!=="water" || withinWaterWindow(item.time));
  items.push({name:"Daily check-in",time:checkinAt(record(),day)});
  const rows=items.sort((a,b)=>a.time.localeCompare(b.time)).map(item=>element("li",translate(item.name)+" · "+formatTime(item.time)));
  byId("message-preview").replaceChildren(...rows);

}

function resetTransientState() {
  byId('breeze-calendar-tools').hidden=true;byId('breeze-calendar-tools').replaceChildren();
  weekBusy = []; macBusy=[];macRead++;
  byId("week-status").textContent = "";
  byId("week-busy-form").reset();
  byId("week-days").replaceChildren();
  byId("recovery-dialog").close();
  byId("recovery-update-form").reset();
  byId("recovery-description").value = "";
  byId("recovery-update-status").textContent = "";
  byId("recovery-save-status").textContent = "";
  byId("recovery-focus").textContent = "";
  feeling = "";
  conversationState = { recent: [], current: null };
  for (const id of ["checkin-form", "chat-form", "learn-form", "times-form"]) byId(id).reset();
  for (const button of document.querySelectorAll("[data-feeling]")) button.setAttribute("aria-pressed", "false");
  for (const id of ["today-status", "checkin-status", "plan-status", "times-status"]) byId(id).textContent = "";
  byId("conversation").replaceChildren();
  byId("recent-chats").replaceChildren();
  byId("checkin-history").replaceChildren();
  resetGuided();
  for (const id of ["task-form", "whatsapp-form", "checkin-preferences", "care-form", "care-near-form"]) byId(id).reset();
  for (const id of ["task-status", "whatsapp-status", "calendar-status", "checkin-preferences-status"]) byId(id).textContent = "";
  byId("task-list").replaceChildren();
  byId("task-custom-field").hidden = true;
  byId("task-custom").required = false;
  byId("care-results").replaceChildren();
  byId("daily-prompt").hidden = true;
  byId("plan-reminder").hidden = true;
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
  const birthInput=byId("birth-date"), today=new Date();
  birthInput.max=localDateInput(today); birthInput.min=localDateInput(new Date(today.getFullYear()-120,today.getMonth(),today.getDate()));
  birthInput.value = profile?.birthDate ?? ""; birthInput.setCustomValidity("");
  byId("recovery-stage").value = profile?.stage ?? "";
  populateLanguageOptions();
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

const pageNames = { profile: "Profile", today: "Today", plan: "My plan", support: "Chat with Breeze", checkins: "Check-ins", reminders: "Reminders", sources: "Medical sources", settings: "Settings", care: "Find care", learn: "Learn" };
function renderRoute(moveFocus) {
  if(location.hash.startsWith('#week-busy=')){
    const fragment=location.hash.replace('#week-busy=','#apple-busy=');
    history.replaceState(null,'','#plan');
    try {weekBusy=AlongsideAppleCalendar.parseFragment(fragment);byId('week-status').textContent='Selected calendar times loaded.';}
    catch {weekBusy=[];byId('week-status').textContent='Could not read those times. Try the helper again.';}
  }
  if(location.hash.startsWith('#apple-busy=')){
    const fragment=location.hash;
    history.replaceState(null,'','#reminders');
    try {pendingAppleCheck={owner:profile?.id,date:dayKey(),ranges:AlongsideAppleCalendar.parseFragment(fragment)};}
    catch {pendingAppleCheck={owner:profile?.id,date:dayKey(),error:true};}
  }
  const requested = location.hash.slice(1);
  document.body.classList.toggle("basic-setup", !hasAgeGroup());
  document.querySelector(".sidebar").classList.remove("menu-open");
  byId("toggle-menu").setAttribute("aria-expanded", "false");
  const openPages = ["support", "profile", "sources", "settings", "care", "learn"];
  const page = !hasAgeGroup() ? "profile" : !requested ? "support" : openPages.includes(requested) ? requested : hasAgeGroup() ? (Object.hasOwn(pageNames, requested) ? requested : "support") : "profile";
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
  if (page === "plan") renderWeek();
  if (page === "support") renderChat();
  if (page === "today") { renderToday(); renderTasks(); }
  if (page === "care") renderCareMode();
  if (page === "learn") renderLearning();
  if (page === "reminders") { renderAppleReview(); if(whatsappController)void whatsappController.refresh().then(()=>reconcileSavedReminders()); calendarController?.refresh(); }
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

byId("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const language = byId("preferred-language").value;
  if (!language) {
    chooseLanguage("preferred-language", "language-status");
    return;
  }
  const name = byId("nickname").value.trim();
  const stage = byId("recovery-stage").value;
  const birthInput = byId("birth-date"), birthDate = birthInput.value, ageGroup = ageGroupFor(birthDate);
  const accountMismatch = ageGroup && account && ((ageGroup==="adult")===account.kids);
  birthInput.setCustomValidity(!ageGroup ? translate("Enter a valid date of birth.") : accountMismatch ? translate(account.kids ? "This account is for people under 18." : "This account is for people 18 or older.") : "");
  if (!ageGroup || accountMismatch) {
    birthInput.reportValidity();
    birthInput.focus();
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
    if(profile && ageGroup==="child" && profile.ageGroup!=="child") {
      const previousId=profile.id;
      if(!await disconnectReminders()){byId("profile-status").textContent="Your reminders could not be disconnected. Check your connection and try again.";return;}
      if(readProfile()?.profile.id!==previousId){syncProfile();return;}
    }
    const nextProfile = { ...profile, ...extras, id: profile?.id ?? crypto.randomUUID(), name, stage, ageGroup, birthDate, language };
    (globalThis.AlongsideAccount?.storage ?? localStorage).setItem(storageKey, JSON.stringify({ profile: nextProfile, data }));
    localStorage.removeItem(legacyStorageKey);
    profile = nextProfile;
    syncReminderPlan();
    useLanguage(language);
    renderProfile();
    chatController?.render();
    byId("profile-status").textContent = "Profile saved.";
    if (completingSetup) {
      location.hash = "#support";
    }
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

byId("delete-dialog").addEventListener("close", async (event) => {
  if (event.target.returnValue !== "delete") return;
  try {
    const stored = readProfile();
    if (stored?.profile.id !== profile?.id) {
      syncProfile();
      return;
    }
    const deletingId=profile?.id;
    if(!await disconnectReminders()) {
      byId("settings-status").textContent="Your reminders could not be disconnected. Check your connection and try again.";
      return;
    }
    if(readProfile()?.profile.id!==deletingId) {syncProfile();return;}
    localStorage.removeItem(legacyStorageKey);
    localStorage.removeItem(languageStorageKey);
    (globalThis.AlongsideAccount?.storage ?? localStorage).removeItem(storageKey);
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
  const item = schedule(record(),dayKey()).find((slot) => slot.id === id);
  setReviewed(item, event.target.checked);
  byId("today-schedule").querySelector('[data-review="' + id + '"]')?.focus({ preventScroll: true });
});

byId("open-reset").addEventListener("click", () => {
  byId("reset-dialog").returnValue = "";
  byId("reset-dialog").showModal();
});

byId("reset-dialog").addEventListener("close", async (event) => {
  if (event.target.returnValue !== "reset") return;
  if(!await saveReminderChange({times:undefined, waterWindow:undefined}, byId("plan-status"),"Reminder times reset."))return;
  renderToday();renderPlan();renderTimeFields();renderReminders();
  byId("times-status").textContent = "";
});

byId("learn-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const select = byId("approved-topic");
  sendApproved(select.selectedOptions[0].textContent, select.value);
});

byId("new-chat").addEventListener("click", () => {
  calendarReview++;byId('breeze-calendar-tools').hidden=true;chatController.newChat();
});
byId("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = byId("chat-message");
  const message = input.value.trim();
  if (!message) { input.focus(); return; }
  if (chatController.busy) return;
  void chatController.send(message);
});
byId("toggle-menu").addEventListener("click", () => {
  const opened = document.querySelector(".sidebar").classList.toggle("menu-open");
  byId("toggle-menu").setAttribute("aria-expanded", String(opened));
});
byId("chat-message").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && matchMedia("(pointer: fine)").matches) { event.preventDefault(); byId("chat-form").requestSubmit(); }
});

for (const key of settings) {
  byId(key).addEventListener("change", async (event) => {
    const control=event.currentTarget, enabled=key==="meals" || control.checked;
    control.checked=Boolean(record().settings[key]);
    if(editingReminders)return;
    if (key === "snacks") captureGuided();
    control.disabled=true;
    const patch={settings:{...record().settings,[key]:enabled}};
    const saved=await saveReminderChange(patch,byId("reminder-change-status"));
    control.disabled=key==="meals";renderReminders();
    if(!saved)return;
    renderTimeFields();
    renderToday();
    renderPlan();
    if (key === "snacks") renderGuided();
  });
}
byId("times-form").addEventListener("submit", async (event) => {
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
  const patch={times:{...record().times,...Object.fromEntries(activeEatingSlots().map(slot=>[slot.id,fields.get(slot.id)]))}};
  if(hasWater)patch.waterWindow={start,end};
  if(macHost && record().macConnected){
    if(!await readMacCalendar()){status.textContent='Calendar unavailable. Your reminder times were not changed.';return;}
  }
  if(!await saveReminderChange(patch,status,"Reminder times saved."))return;
  if(macHost && record().macConnected)openWeek();
  renderToday();
  renderPlan();
  renderReminders();
});
function renderHelp() {
  byId("younger-support").hidden = !hasAgeGroup() || profile.ageGroup === "adult";
  byId("age-needed").hidden = hasAgeGroup();
}

for (const button of document.querySelectorAll("[data-help]")) {
  button.addEventListener("click", () => {
    renderHelp();
    byId("help-dialog").showModal();
  });
}
byId("help-dialog").addEventListener("click", (event) => { if (event.target.closest('a[href^="#"]')) byId("help-dialog").close(); });
byId("therapy-profile-link").addEventListener("click", () => {
  byId("help-dialog").close();
  byId("birth-date").focus();
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
 AE: [ ['UAE Ministry of Health and Prevention', 'https://mohap.gov.ae/en/about-us/medical-facilities-directory', 'Search the official medical facilities directory. Confirm services and eligibility.'], ['Abu Dhabi Department of Health', 'https://stem.doh.gov.ae/publicmap/', 'Public health facility map for the emirate of Abu Dhabi.'] ]
};
const researchedCareSources = {
  AT: [["List of medical facilities in Austria", "https://www.gov.uk/government/publications/austria-doctors/list-of-medical-facilities-in-austria", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  AU: [["Australian mental health services", "https://www.healthdirect.gov.au/healthcare-and-services/mental-health/australian-mental-health-services", ""]],
  AZ: [["Ministry of Health mental health center", "https://sehiyye.gov.az/en/nazirliyin-qurumlari/psixi-saglamliq-m-rk-zi/", ""]],
  BB: [["Barbados mental health services directory", "https://www.health.gov.bb/For-Public/Mental-Health-Care", ""]],
  BE: [["Belgian federal guide to psychiatric hospitals", "https://www.health.belgium.be/en/themes/health/organisatie-gezondheidszorg/healthcare-facilities-belgium", ""]],
  BF: [["Burkina Faso: list of doctors and medical facilities", "https://www.gov.uk/government/publications/burkina-faso-doctors-and-medical-facilities/burkina-faso-list-of-doctors-and-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  BG: [["List of medical facilities in Bulgaria", "https://www.gov.uk/government/publications/bulgaria-list-of-medical-facilities/bulgaria-doctors", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  BH: [["Psychiatric Hospital, Bahrain", "https://www.moh.gov.bh/HealthInstitution/PsychiatricHospital?lang=en", ""]],
  BI: [["Burundi: List of Medical Facilities", "https://www.gov.uk/government/publications/burundi-list-of-medical-facilitiespractitioners/burundi-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  BN: [["Brunei Ministry of Health psychiatric services", "https://moh.gov.bn/services/psychiatric-services/", ""]],
  BR: [["List of medical facilities/practitioners in Brazil", "https://www.gov.uk/government/publications/list-of-doctors--2/list-of-doctors-in-brazil", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  BS: [["The Bahamas: medical facilities", "https://www.gov.uk/government/publications/list-of-medical-facilitiespractitioners-in-bahamas/bahamas-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  BT: [["Jigme Dorji Wangchuck National Referral Hospital · Psychiatry", "https://jdwnrh.gov.bt/clinical-departments/psychiatry-2/", ""]],
  BY: [["List of medical facilities in Belarus", "https://www.gov.uk/government/publications/belarus-list-of-medical-facilities/list-of-medical-facilities-in-belarus", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  BZ: [["Belize: medical facilities", "https://www.gov.uk/government/publications/belize-list-of-medical-facilities/belize-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  CF: [["CAR: List of English medical facilities and practitioners", "https://www.gov.uk/government/publications/central-african-republic-medical-facilities-and-practitioners/list-of-medical-facilities-and-practitioners-in-car", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  CH: [["Geneva University Hospitals · Psychiatric Hospital", "https://www.hug.ch/en/lhopital-de-psychiatrie", ""]],
  CN: [["Shanghai Mental Health Center", "https://www.smhc.org.cn/english/ABOUTUS/ABOUT_US.htm", ""]],
  CO: [["Colombia: medical facilities", "https://www.gov.uk/government/publications/colombia-list-of-medical-facilities/list-of-medical-facilities-in-colombia", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  CU: [["Cuba: medical facilities", "https://www.gov.uk/government/publications/cuba-list-of-medical-facilitiespractitioners/list-of-medical-facilities-cuba", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  CY: [["List of hospitals in Cyprus", "https://www.gov.uk/government/publications/cyprus-hospitals/list-of-hospitals-in-cyprus", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  CZ: [["Czechia: medical facilities and practitioners", "https://www.gov.uk/government/publications/czech-republic-list-of-medical-facilitiespractitioners/list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  DE: [["German national hospital search", "https://gesund.bund.de/en/service/krankenhaussuche", ""]],
  DO: [["List of medical facilities and practitioners in Dominican Republic", "https://www.gov.uk/government/publications/dominican-republic-list-of-medical-facilities-and-practitioners/dominican-republic-medical-facilities-and-practitioners", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  DZ: [["Algeria: doctors", "https://www.gov.uk/government/publications/algeria-doctors/algeria-doctors--2", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  EC: [["Ecuador: hospitals", "https://www.gov.uk/government/publications/ecuador-hospitals-and-doctors/ecuador-list-of-hospitals", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  EE: [["List of medical facilities in Estonia", "https://www.gov.uk/government/publications/estonia-doctors/estonia-doctors", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  ER: [["List of English speaking medical facilities in Eritrea", "https://www.gov.uk/government/publications/eritrea-doctors/eritrea-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  ET: [["Ethiopia Ministry of Health facility register", "https://mfrpublic.moh.gov.et/", ""]],
  FI: [["HUS psychiatry services in Uusimaa", "https://www.hus.fi/en/about-us/departments/psychiatry", ""]],
  FJ: [["Fiji Ministry of Health facility map", "https://www.health.gov.fj/interactive-map", ""]],
  GB: [["Newham Centre for Mental Health, London", "https://www.elft.nhs.uk/services/newham-centre-mental-health", ""]],
  GD: [["Grenada: medical facilities", "https://www.gov.uk/government/publications/grenada-list-of-medical-facilities-practitioners/grenada-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  GH: [["Ghana: List of Medical Facilities", "https://www.gov.uk/government/publications/ghana-list-of-medical-facilities/ghana-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  GY: [["National Psychiatric Hospital, Guyana", "https://portal.gov.gy/agencies/national-psychiatric-hospital", ""]],
  HN: [["Honduras: medical facilities", "https://www.gov.uk/government/publications/list-of-medical-facilities-in-honduras/honduras-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  HR: [["Croatia: medical facilities", "https://www.gov.uk/government/publications/medical-facilities-in-croatia/croatia-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  IE: [["Mental Health Commission · Approved centres", "https://www.mhcirl.ie/what-we-do/regulation/office-inspector-mental-health-services/overview-mental-health-services", ""]],
  IM: [["Manannan Court acute mental health services", "https://www.gov.im/categories/caring-and-support/mental-health-service/manannan-court-acute-services/", ""]],
  IN: [["India · Government mental hospitals by state (2022 report, section 6.2.7)", "https://cbhidghs.mohfw.gov.in/sites/default/files/2024-09/national-health-profile-2022.pdf", ""]],
  IS: [["Iceland: medical facilities", "https://www.gov.uk/government/publications/iceland-list-of-medical-facilitiespractitioners/iceland-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  JE: [["Jersey inpatient mental health services", "https://www.gov.je/Health/Mental/AdultMentalHealth/HospitalCare/Pages/home.aspx", ""]],
  JM: [["Jamaica Ministry of Health facility locations", "https://www.moh.gov.jm/location-of-hospitals-and-health-centres/", ""]],
  JO: [["Jordan Ministry of Health hospital directory", "https://www.moh.gov.jo/EN/List/Hospitals", ""]],
  JP: [["Japan’s national medical directory (NAVII)", "https://www.iryou.teikyouseido.mhlw.go.jp/znk-web/juminkanja/S2300/initialize", "Choose a prefecture and search for Psychiatry (精神科)."]],
  KG: [["List of medical facilities in Kyrgyzstan", "https://www.gov.uk/government/publications/kyrgyzstan-list-of-medical-facilitiespractitioners/list-of-medical-facilities-in-kyrgyzstan", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  KM: [["Comoros: List of medical facilities", "https://www.gov.uk/government/publications/comoros-doctors/comoros-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  KR: [["Ajou University Hospital · Psychiatry", "https://hosp.ajoumc.or.kr/en/hospital/deptView.do?deptCd=PSY&deptNo=22", ""]],
  LK: [["National Institute of Mental Health · Inpatient services", "https://nimh.health.gov.lk/en/in-patient-services/", ""]],
  ME: [["Montenegro government directory of specialist hospitals", "https://www.gov.me/en/article/specialised-hospitals-in-montenegro", ""]],
  MK: [["North Macedonia Ministry of Health · Health center addresses", "https://zdravstvo.gov.mk/en-GB/ustanovi/adresi-na-zd", ""]],
  MM: [["List of medical facilities/practitioners in Myanmar", "https://www.gov.uk/government/publications/myanmar-list-of-medical-facilitiespractitioners/list-of-medical-facilitiespractitioners-in-myanmar", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  MR: [["Mauritania: List of Medical Facilities", "https://www.gov.uk/government/publications/mauritania-doctors/mauritania-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  NI: [["Nicaragua: medical facilities", "https://www.gov.uk/government/publications/hospitals-in-nicaragua/nicaragua-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  NL: [["Netherlands: list of medical facilities", "https://www.gov.uk/government/publications/the-netherlands-list-of-medical-facilitiespractitioners/netherlands-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  NP: [["Patan Academy of Health Sciences · Psychiatry", "https://web.pahs.edu.np/hospital-services/in-patient-department/department-of-psychiatry/", ""]],
  OM: [["Al Masarra Hospital", "https://moh.gov.om/en/hospitals-directorates/hospitals/al-masarra-hospital/", ""]],
  PG: [["Port Moresby General Hospital · Psychiatry", "https://pomgen.gov.pg/psychiatry/", ""]],
  PL: [["List of medical facilities in Poland", "https://www.gov.uk/government/publications/poland-list-of-medical-facilities/poland-doctors", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  QA: [["Qatar Ministry of Public Health facility finder", "https://hukoomi.gov.qa/en/categories/business-registration-licenses/find-health-facility-in-qatar", ""]],
  RO: [["Romania: medical facilities", "https://www.gov.uk/government/publications/medical-facilities-list-romania/romania-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  RS: [["Serbia: medical facilities", "https://www.gov.uk/government/publications/serbia-list-of-medical-facilitiespractitioners/serbia-list-of-medical-facilities--2", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  RW: [["Rwanda Ministry of Health hospital directory", "https://www.moh.gov.rw/affiliates-teaching-hospitals/hospitals", ""]],
  SC: [["Seychelles Ministry of Health hospital directory", "https://www.health.gov.sc/seychelles-hospitals/", ""]],
  SI: [["Slovenia: medical facilities and pharmacies", "https://www.gov.uk/government/publications/slovenia-list-of-medical-facilities/list-of-medical-facilities-and-practitioners-in-slovenia", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  SK: [["Slovakia: medical facilities", "https://www.gov.uk/government/publications/slovakia-list-of-medical-facilitiespractitioners/slovakia-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  SS: [["South Sudan: medical facilities", "https://www.gov.uk/government/publications/south-sudan-doctors/south-sudan-medical-facilities--2", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  TG: [["Togo: list of medical facilities", "https://www.gov.uk/government/publications/togo-doctors/togo-list-of-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  TH: [["Thailand government dataset of mental health and psychiatric service locations", "https://data.go.th/th/dataset/service-dmh", ""]],
  TJ: [["List of medical facilities/practitioners in Tajikistan", "https://www.gov.uk/government/publications/tajikistan-doctors/list-of-medical-facilitiespractitioners-in-tajikistan", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  TL: [["List of medical facilities in Timor-Leste", "https://www.gov.uk/government/publications/timor-leste-medical-facilities/list-of-medical-facilities-in-timor-leste", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  TR: [["List of medical facilities in Turkey", "https://www.gov.uk/government/publications/turkey-list-of-medical-practitioners/list-of-medical-facilities-in-turkey", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  TT: [["Trinidad and Tobago Ministry of Health facility directory", "https://health.gov.tt/health-facilities", ""]],
  UZ: [["Uzbekistan: medical facilities", "https://www.gov.uk/government/publications/uzbekistan-list-of-medical-facilitiespractitioners/uzbekistan-medical-facilities", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  VE: [["List of medical facilities in Venezuela", "https://www.gov.uk/government/publications/venezuela-list-of-medical-facilities-practitioners/list-of-medical-facilities-in-venezuela", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
  XK: [["Kosovo: medical facilities", "https://www.gov.uk/government/publications/kosovo-list-of-medical-facilitiespractitioners/list-of-medical-facilities-in-kosovo", "UK government directory for visitors. It includes general medical facilities. Check psychiatry services with the provider."]],
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
 const list=byId('nutrient-list');list.replaceChildren();
 for(const [id,name] of Object.entries(globalThis.AlongsideMeals.nutrients)){
   const label=element('label',''),input=document.createElement('input');
   input.type='checkbox';input.id='need-'+id;input.value=id;input.checked=Boolean(profile?.needs?.includes(id));
   label.append(input,document.createTextNode(' '+translate(name)));list.append(label);
 }
 byId('diagnosis-other-field').hidden=byId('diagnosis').value!=='other';
 byId('care-country').value=countryLabel(profile?.country); byId('care-city').value=profile?.city || '';

 byId('checkin-kind').value=record().checkinKind || 'meals'; byId('checkin-time').value=record().checkinTime || '20:00';
 byId('checkin-zone').textContent=zone();
}
function readProfileExtras() {
 const input=byId('profile-timezone');
 try { new Intl.DateTimeFormat('en',{timeZone:input.value.trim()}); input.setCustomValidity(''); } catch { input.setCustomValidity(translate('Choose a valid time zone, such as Asia/Riyadh.')); input.reportValidity(); return null; }
 return {country:resolveCountry(byId('profile-country').value),city:byId('profile-city').value.trim(),timeZone:input.value.trim(),diagnosis:byId('diagnosis').value,diagnosisOther:byId('diagnosis-other').value.trim(),careTeam:byId('care-team').value,gender:byId('profile-gender').value.trim(),needs:Object.keys(globalThis.AlongsideMeals.nutrients).filter(id=>byId('need-'+id).checked),otherNeeds:byId('other-needs').value.trim(),allergies:byId('allergies').value.trim(),fluidNote:byId('fluid-note').value.trim(),carePlanNote:byId('care-plan-note').value.trim()};
}
// Children are not asked for their location; the city search stays available to them.
function renderCareMode() {
 const child=profile?.ageGroup==='child';
 byId('care-near-form').hidden=child; byId('care-child-note').hidden=!child;
 if(child)byId('care-city-search').open=true;
}
function renderCare() {
 const country=resolveCountry(byId('care-country').value); const city=byId('care-city').value.trim(); const out=byId('care-results'); out.replaceChildren();
 if(!country)return;
 const publicFirst=byId('care-public').checked;
 const rows=[...(Object.hasOwn(researchedCareSources,country) ? researchedCareSources[country] : []), ...(Object.hasOwn(careDirectories,country) ? careDirectories[country] : [])].filter(row=>!publicFirst || country!=='SA' || row[0]!=='Johns Hopkins Aramco Healthcare');
 if(country==='SA' && /^(?:dammam|ad[ -]dammam|الدمام|دمام)$/iu.test(city)){
   rows.unshift(['Dammam health center locations', 'https://www.moh.gov.sa/en/ministry/projects/with-you/pages/eastern-province.aspx', 'The Ministry of Health lists Al-Faisaliah and Al-Hamra in Dammam. Open the directory for location links. Contact the center to ask about eating concerns, age eligibility and appointments.']);
 }
 const heading=element('h2','Directory results');
 const context=element('div','','stack');
 context.append(heading,userText('p',[city,countryLabel(country)].filter(Boolean).join(' · ')));
 if(publicFirst)context.append(element('small','Ask the provider about fees and eligibility.'));
 out.append(context);
 const facilities = {
   KW: [['Kuwait Center for Mental Health','Shuwaikh Medical, Sabah Health Region, Kuwait','https://kuwaitpsych.com/KCMH/', ['kuwait','kuwait city','shuwaikh','shuwaikh medical','الكويت','مدينة الكويت','الشويخ']]],
   RU: [['Bekhterev National Medical Research Center for Psychiatry and Neurology','3 Bekhtereva Street, Saint Petersburg 192019, Russia','https://bekhterev.ru/contacts/',['saint petersburg','st petersburg','st. petersburg','санкт-петербург']]],
   JP: [
     ['Tokyo Metropolitan Matsuzawa Hospital', '2-1-1 Kamikitazawa, Setagaya-ku, Tokyo', 'https://www.tmhp.jp/matsuzawa/en/overview.html', ['tokyo','tokio','東京','東京都','setagaya','世田谷区']],
     ['National Center Hospital, National Center of Neurology and Psychiatry', '4-1-1 Ogawa-Higashi, Kodaira, Tokyo 187-8551', 'https://hsp.ncnp.go.jp/EN/', ['tokyo','tokio','東京','東京都','kodaira','小平市']]
   ],
   NZ: [['Waiatarau Inpatient Mental Health Unit','75 Lincoln Road, Henderson, Auckland 0610','https://www.health.govt.nz/regulation-legislation/certification-of-health-care-services/certified-providers/public-hospitals/waiatarau-inpatient-mental-health-unit',['auckland','henderson']]],
   UG: [['Butabika Hospital','Plot 2, Kirombe – Butabika Road, Kampala','https://butabikahospital.go.ug/',['kampala','butabika']]],
   SN: [['Hôpital Principal de Dakar · Psychiatry','Rue du Dr Guillet, Dakar','https://cild.gouv.sn/ova_sev/national-planning-9/',['dakar']]]
 };
 function mapUrl(query){
   const url=new URL('https://www.google.com/maps/search/');
   url.searchParams.set('api','1');url.searchParams.set('query',query);
   return url.href;
 }
 function link(label,url){
   const a=element('a',label,'action outline');
   a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
 }
 const place=[city,countryLabel(country)].filter(Boolean).join(', ');
 const matches=(Object.hasOwn(facilities,country) ? facilities[country] : []).filter(row=>!city || row[3].includes(normalizeLanguageName(city).normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
 for(const [name,address,source] of matches){
   const card=element('article','','panel stack');
   card.append(element('h3',name),element('p',address),link('Hospital information',source),link('Get directions',globalThis.alongsideDirectionsUrl(name+', '+address+', '+countryLabel(country))),link('View address on Google Maps',mapUrl(name+', '+address+', '+countryLabel(country))));
   out.append(card);
 }
 const live=element('article','','panel stack');
 live.append(element('h3','Live hospital search'),element('small','Search sends the city, country and type of care to Google Maps. Confirm services and age eligibility directly with the provider.'));
 if(location.protocol==='file:'){
   live.append(element('p','Start Open-Find-Care.command on your Mac for live search.'));
 }else{
   const button=element('button','Search Google Maps here','action');
   button.type='button';
   const feedback=element('p','');feedback.setAttribute('role','status');
   const listings=element('div','','stack');
   button.onclick=async()=>{
     button.disabled=true;feedback.textContent='Searching Google Maps…';listings.replaceChildren();
     try{
       const result=await globalThis.AlongsidePlaces(countryLabel(country),city,publicFirst);
       if(!result.places.length){feedback.textContent='Google Maps returned no matches. Try a nearby city or a broader area.';return;}
       feedback.textContent='';
       const credit=element('strong','Google Maps');credit.setAttribute('translate','no');listings.append(credit);
       for(const hospital of result.places){
         const item=element('div','','panel stack');
         item.append(element('h4',hospital.name),element('p',hospital.address));
         item.append(link('Get directions',globalThis.alongsideDirectionsUrl(hospital.name+', '+hospital.address,hospital.placeId)));
         if(/^https:\/\//.test(hospital.url))item.append(link('View on Google Maps',hospital.url));
         for(const a of hospital.attributions||[])if(a.name)item.append(/^https:\/\//.test(a.uri)?link(a.name,a.uri):element('small',a.name));
         listings.append(item);
       }
     }catch(error){feedback.textContent=error instanceof SyntaxError?'Live search is unavailable on this version of Alongside.':error.message;}
     finally{button.disabled=false;}
   };
   live.append(button,feedback,listings);
 }
 live.hidden=true;
 out.append(live);
 globalThis.alongsidePlacesReady().then(ready=>{live.hidden=!ready;});
 const mapCard=element('article','','panel stack');
 mapCard.append(userText('h3','Search hospital locations in '+place));
 if(!matches.length)mapCard.append(element('p','Alongside has no individually checked hospital address for this area yet.'));
 mapCard.append(element('small','Opening Google Maps shares this search area with Google. Map listings can be incomplete. Confirm services and age eligibility with the hospital.'));
 mapCard.append(link('Search Google Maps',mapUrl((publicFirst?'public psychiatric hospitals in ':'psychiatric hospitals in ')+place)));
 out.append(mapCard);
 for (const [name,url,note] of rows) {
   const card=element('div','','panel stack');card.append(element('h3',name));
   if(note)card.append(element('p',note));
   card.append(link('View source',url));out.append(card);
 }
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
 const done=record().checkins.some(c=>c.day===dayKey());const due=localClock()>=checkinAt(record(),dayKey());
 byId('daily-prompt-title').textContent=done?'Your check-in is saved':due?'Your daily check-in is ready':'A moment for your daily check-in';
 byId('daily-prompt-copy').textContent=done?'You can revisit it or add another reflection whenever you want.':'Daily check-in · '+formatTime(checkinAt(record(),dayKey()))+' · '+zone();
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
}
function renderLearning() {
 const out=byId('learn-cards');out.replaceChildren();
 for(const id of ['warningSigns','boneHealth']) {const answer=medicalAnswers[id];const card=element('section','','panel stack');card.append(element('h2',answer.title),element('p',answer.text),sourceLinks(answer.sources));out.append(card);}

}
function zonedToUtc(day,time,timeZone) {
 const [y,m,d]=day.split('-').map(Number);const [h,min]=time.split(':').map(Number);const target=Date.UTC(y,m-1,d,h,min);let guess=target;
 for(let i=0;i<4;i++){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const get=t=>Number(parts.find(p=>p.type===t).value);const shown=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));guess+=target-shown;}
 return new Date(guess);
}
function reviewMealReminder(name,time){
  const dialog=document.createElement('dialog');
  const form=element('form','','stack');
  const title=element('h2',name);
  dialog.setAttribute('aria-label',name+' calendar reminder');
  const dateField=element('label','Reminder date','field'), date=document.createElement('input');
  date.type='date';date.required=true;date.min=dayKey();date.value=date.min;
  if(+zonedToUtc(date.value,time,zone())<=Date.now()){
    const tomorrow=new Date(date.value+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    date.value=tomorrow.toISOString().slice(0,10);
  }
  dateField.append(date);
  const status=element('p','','status');status.setAttribute('role','status');
  const add=element('button','Add to calendar','action');add.type='submit';
  const close=element('button','Close','action outline');close.type='button';close.onclick=()=>dialog.close();
  form.append(title,element('p','One reminder at '+formatTime(time)+' · '+zone()),dateField,add,close,status);
  form.onsubmit=async e=>{
    e.preventDefault();
    const start=zonedToUtc(date.value,time,zone());
    if(+start<=Date.now()){status.textContent='Choose a future date.';return;}
    add.disabled=true;date.disabled=true;
    try{
      if(['http://127.0.0.1:4174','http://127.0.0.1:4175'].includes(location.origin)){
        if(await AlongsideAppleCalendar.addMeal(name,start)){status.textContent='Saved to Mac Calendar.';return;}
      }
    }catch{}
    const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const event=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Alongside//Meals//EN','BEGIN:VEVENT',
      'UID:'+name.replaceAll(' ','-')+'-'+stamp(start)+'@alongside','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(start),
      'DTEND:'+stamp(new Date(+start+300000)),'SUMMARY:'+name,'COLOR:ForestGreen','BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0S',
      'DESCRIPTION:'+name,'END:VALARM','END:VEVENT','END:VCALENDAR',''];
    downloadFile(name+'.ics',event.join('\r\n'),'text/calendar;charset=utf-8');
    status.textContent='Open the downloaded calendar file and click Add to finish.';
    date.disabled=false;add.disabled=false;
  };
  dialog.append(form);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function calendarText() {
 const stamp=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'); const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Alongside//Reminders//EN','CALSCALE:GREGORIAN','COLOR:ForestGreen','X-APPLE-CALENDAR-COLOR:#228B22'];
 const kinds=record().settings;const slots=schedule().filter(s=>(s.kind==='meals'?true:s.kind==='snacks'?kinds.snacks:kinds.water)&& (s.kind!=='water'||withinWaterWindow(s.time)));
 slots.push({id:'checkin',name:'Daily check-in',time:record().checkinTime || '20:00'});
 const today=dayKey();const base=new Date(today+'T12:00:00Z');
 for(let i=0;i<7;i++){const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);const day=d.toISOString().slice(0,10);for(const slot of slots){const time=slot.id==='checkin' ? checkinAt(record(),day) : schedule(record(),day).find(s=>s.id===slot.id)?.time ?? slot.time;const start=zonedToUtc(day,time,zone());if(start<new Date())continue;const title=translate(kinds.discreet?'Alongside reminder':slot.name);lines.push('BEGIN:VEVENT','UID:'+crypto.randomUUID()+'@alongside','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(start),'DTEND:'+stamp(new Date(start.getTime()+5*60000)),'COLOR:ForestGreen','SUMMARY:'+title,'DESCRIPTION:'+translate('Open Alongside for your reminder. Time zone')+' '+zone(),'BEGIN:VALARM','TRIGGER:PT0S','ACTION:DISPLAY','DESCRIPTION:'+title,'END:VALARM','END:VEVENT');}}
 lines.push('END:VCALENDAR');return lines.map(line=>/^[\x00-\x7F]*$/.test(line)?line.replace(/(.{75})(?=.)/g,'$1\r\n '):line).join('\r\n')+'\r\n';
}
function downloadFile(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function initializeFreeFeatures() {
 prepareCountryOptions();const timeList=byId('timezone-options');const zones=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):['UTC','Asia/Riyadh','America/New_York','Europe/London'];for(const tz of [...new Set(['UTC',...zones])]) {const o=element('option','');o.value=tz;timeList.append(o);}
 byId('diagnosis').addEventListener('change',()=>byId('diagnosis-other-field').hidden=byId('diagnosis').value!=='other');
 byId('birth-date').addEventListener('input',e=>{e.target.setCustomValidity('');});
 byId('profile-timezone').addEventListener('input',e=>e.target.setCustomValidity(''));
 byId('use-device-zone').addEventListener('click',()=>{byId('profile-timezone').value=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';byId('profile-timezone').setCustomValidity('');});
 byId('profile-care-link').addEventListener('click',()=>{byId('care-country').value=byId('profile-country').value;byId('care-city').value=byId('profile-city').value;});
 byId('care-near-form').addEventListener('submit',event=>{
   event.preventDefault();
   if(profile?.ageGroup==='child')return;
   const results=byId('care-results');
   globalThis.AlongsideNearby(results,byId('care-public').checked,()=>{byId('care-city-search').open=true;});
   results.focus({preventScroll:true});
   results.scrollIntoView({block:'start'});
 });
 byId('care-form').addEventListener('submit',event=>{
   event.preventDefault();
   renderCare();
   const results=byId('care-results');
   results.focus({preventScroll:true});
   results.scrollIntoView({block:'start'});
 });
 byId('ask-learn-meals').onclick=()=>{location.hash='#support';requestAnimationFrame(()=>chatController.openMealIdeas());};
 byId('checkin-preferences').addEventListener('submit',e=>{e.preventDefault();record().checkinKind=byId('checkin-kind').value;record().checkinTime=byId('checkin-time').value;const saved=persist();resetGuided();renderDailyPrompt();byId('checkin-preferences-status').textContent=saved?'Check-in preferences saved.':'Preferences could not be saved.';});
 byId('guided-back').addEventListener('click',()=>{captureGuided();guidedState.step=Math.max(0,guidedState.step-1);renderGuided();byId('guided-title').focus();});
 byId('checkin-form').addEventListener('submit',e=>{e.preventDefault();captureGuided();if(guidedState.step===activeGuidedSteps().length-1)saveGuided();else{guidedState.step++;renderGuided();byId('guided-title').focus();}});
 byId('task-type').addEventListener('change',()=>{byId('task-custom-field').hidden=byId('task-type').value!=='custom';byId('task-custom').required=byId('task-type').value==='custom';});
 byId('task-form').addEventListener('submit',e=>{e.preventDefault();const pick=byId('task-type');const text=pick.value==='custom'?byId('task-custom').value.trim():pick.value;if(!text)return;if((record().tasks || []).length>=20){byId('task-status').textContent='You can keep up to 20 daily tasks.';return;}const currentData=record();const currentId=profile?.id;const previous=currentData.tasks || [];currentData.tasks=[...previous,{id:crypto.randomUUID(),text,custom:pick.value==='custom',doneDay:''}];if(!persist()){if(profile?.id===currentId && record()===currentData)currentData.tasks=previous;byId('task-status').textContent='Your task could not be saved.';return;}e.currentTarget.reset();byId('task-custom-field').hidden=true;byId('task-custom').required=false;renderTasks();byId('task-status').textContent='Task added.';});
 byId('task-list').addEventListener('change',e=>{const task=record().tasks?.find(t=>t.id===e.target.dataset.task);if(!task)return;task.doneDay=e.target.checked?dayKey():'';persist();renderTasks();});
 byId('task-list').addEventListener('click',e=>{const id=e.target.closest('[data-remove-task]')?.dataset.removeTask;if(!id)return;record().tasks=(record().tasks || []).filter(t=>t.id!==id);persist();renderTasks();});
 byId('download-calendar').addEventListener('click',()=>{downloadFile('alongside-reminders.ics',calendarText(),'text/calendar;charset=utf-8');byId('calendar-status').textContent='Calendar downloaded. Import it in your calendar app and allow its reminders.';});
 populateProfileExtras();resetGuided();renderLearning();renderTasks();renderDailyPrompt();
 setInterval(renderDueReminders, 10000);
 document.addEventListener('visibilitychange', () => { if (!document.hidden) renderDueReminders(); });
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
  reviewMealReminder, calendarTools,
  mealProfile: () => ({needs:profile?.needs,diagnosis:profile?.diagnosis,allergies:Boolean(profile?.allergies),otherNeeds:profile?.otherNeeds}),
  getAgeGroup: () => profile?.ageGroup, translateText: text => translate(text),
  onAction: (action) => { if(action==="calendar"){location.assign(byId("week-calendar-picker").href);return;} if(action==="week"){void calendarTools();return;} if(action==="meals"){chatController.openMealIdeas();return;} if (action === "human") { renderHelp(); byId("help-dialog").showModal(); } else location.hash = "#" + ({checkin:"checkins",routine:"today",care:"care",profile:"profile",reminders:"reminders"}[action] || "support"); }
});
let calendarReview=0;
async function calendarTools({scope='week',name=null,time=null}={}){
  const panel=byId('breeze-calendar-tools'), token=++calendarReview, owner=profile?.id;
  if(!hasAgeGroup()){location.hash='#profile';return;}
  const current=()=>token===calendarReview && owner===profile?.id && !byId('support-title').closest('[data-page]').hidden;
  const heading=element('h2','Your calendar plan'), status=element('p','Checking Mac Calendar…','status');
  status.setAttribute('role','status');heading.tabIndex=-1;
  panel.hidden=false;panel.replaceChildren(heading,status);heading.focus();
  if(!['http://127.0.0.1:4174','http://127.0.0.1:4175'].includes(location.origin)){
    status.textContent='Choose calendar times to share or enter busy times in your weekly plan.';
    const picker=element('a','Choose calendar times','action');
    picker.href='./apple-calendar.html';
    const manual=element('button','Enter busy times','action outline');
    manual.type='button';manual.onclick=openWeek;panel.append(picker,manual);
    return;
  }
  const retry=element('button','Check again','action outline');
  retry.onclick=()=>calendarTools({scope,name,time});
  let busy;
  try{busy=await AlongsideAppleCalendar.readMacBusy();}
  catch{
    if(current()){status.textContent='Calendar access is unavailable. Restart the local Breeze server, then allow Alongside Calendar access on your Mac.';panel.append(retry);}
    return;
  }
  if(!current())return;
  let dates=weekDates();
  if(scope==='today')dates=dates.slice(0,1);
  if(scope==='tomorrow')dates=dates.slice(1,2);
  const entries=[], fields=[];
  for(const date of dates){
    let slots=schedule(record(),date).filter(s=>['meals','snacks'].includes(s.kind));
    const allSlots=slots;
    if(name){
      const match=slots.find(s=>s.name.toLowerCase()===name.toLowerCase());
      slots=match?[{...match,time:time||match.time}]:time?[{id:'custom',name,time,kind:'snacks'}]:[];
    }
    slots=slots.filter(s=>+zonedToUtc(date,s.time,zone())>Date.now()).map(s=>({...s,minutes:s.kind==='meals'?30:5}));
    if(!slots.length)continue;
    const group=element('fieldset','','stack');
    group.append(element('legend',date+' · '+zone()));
    const reserved=[];
    for(const slot of slots){
      const row=element('label',slot.name+' · '+formatTime(slot.time),'field');
      const otherMeals=allSlots.filter(s=>s.id!==slot.id).map(s=>{
        const start=+zonedToUtc(date,s.time,zone());
        return {start,end:start+(s.kind==='meals'?30:5)*60000};
      });
      const [conflict]=AlongsideAppleCalendar.compare(slots,[...busy,...reserved,...otherMeals],date,zone(),zonedToUtc).filter(c=>c.id===slot.id);
      const entry={date,slot,selected:slot.time,keep:false,saved:false};
      if(conflict){
        const fmt=new Intl.DateTimeFormat(interfaceLocale(),{timeZone:zone(),hour:'numeric',minute:'2-digit'});
        row.append(element('small','Busy '+fmt.format(conflict.busy.start)+' – '+fmt.format(conflict.busy.end)));
        const select=element('select');
        select.add(new Option('Choose a time',''));
        for(const t of [conflict.earlier,conflict.later].filter(Boolean))select.add(new Option('Move to '+formatTime(t),t));
        select.add(new Option('Keep '+formatTime(slot.time),slot.time));
        entry.selected='';select.onchange=()=>{entry.selected=select.value;entry.keep=select.value===slot.time;refresh();};
        row.append(select);fields.push(select);
        const proposed=conflict.earlier||conflict.later;
        if(proposed){const start=+zonedToUtc(date,proposed,zone());reserved.push({start,end:start+slot.minutes*60000});}
      }
      entries.push(entry);group.append(row);
    }
    panel.append(group);
    if(scope==='next')break;
  }
  if(!entries.length){status.textContent='No upcoming meals match that request.';return;}
  const clashes=entries.filter(e=>!e.selected).length;
  status.textContent=clashes?clashes+' meal time(s) overlap. Choose which times to use.':'Calendar checked. These meal times are free.';
  const save=element('button','Save to Mac Calendar','action');
  function refresh(){save.disabled=entries.some(e=>!e.selected);}
  refresh();panel.append(save,retry);
  save.onclick=async()=>{
    save.disabled=true;retry.disabled=true;fields.forEach(f=>f.disabled=true);
    try{
      const fresh=await AlongsideAppleCalendar.readMacBusy();
      if(!current())return;
      const pending=entries.filter(e=>!e.saved);
      for(const e of pending){
        const start=+zonedToUtc(e.date,e.selected,zone());
        if(start<=Date.now() || (!e.keep && fresh.some(r=>r.start<start+e.slot.minutes*60000 && r.end>start))){
          status.textContent='Availability changed. Check again before saving.';return;
        }
      }
      for(const e of pending){
        if(!current())return;
        if(!await AlongsideAppleCalendar.addMeal(e.slot.name,zonedToUtc(e.date,e.selected,zone())))throw Error();
        e.saved=true;
      }
      status.textContent='Saved '+entries.length+' meal reminder(s) to Mac Calendar.';
    }catch{status.textContent='Saved '+entries.filter(e=>e.saved).length+' of '+entries.length+'. Check calendar access and retry the remaining meals.';refresh();}
    finally{retry.disabled=false;}
  };
}
function checkinAt(plan, date) {
  return (plan.weekZone===zone() && plan.weekCheckins?.[date]) || plan.checkinTime || '20:00';
}
function openWeek() {
  if (!hasAgeGroup()) { location.hash='#profile'; return; }
  location.hash='#plan';
  if(macHost && record().macConnected)void readMacCalendar();
  requestAnimationFrame(()=>byId('week-title').focus());
}
async function readMacCalendar(){
  const plan=record(), request=++macRead, status=byId('week-status');
  status.textContent='Checking Mac Calendar…';
  try{
    const ranges=await AlongsideAppleCalendar.readMacBusy();
    if(request!==macRead || record()!==plan)return false;
    macBusy=ranges;
    plan.macConnected=true;persist(false);
    status.textContent='Calendar checked. Review any overlaps below.';renderWeek();return true;
  }catch(error){
    if(request===macRead && record()===plan){macBusy=[];renderWeek();status.textContent=error.message==='calendar-denied'?'Calendar access was denied. Check System Settings → Privacy & Security → Calendars.':'Alongside could not reach Mac Calendar. Open the Alongside Calendar launcher in Finder and retry.';}
    return false;
  }
}
byId('mac-connect').onclick=readMacCalendar;
byId('mac-disconnect').onclick=()=>{
  macRead++; macBusy=[];record().macConnected=false;persist(false);renderWeek();
  byId('week-status').textContent='Disconnected. Alongside has cleared the busy times.';
};
function saveMacMeal(date,id,time){
  const plan=record(), dates=weekDates();
  if(!profile || !dates.includes(date))return;
  const meals=plan.macMealZone===zone()?Object.fromEntries(Object.entries(plan.macMeals||{}).filter(([d])=>dates.includes(d))):{};
  meals[date]={...meals[date]};if(time)meals[date][id]=time;else delete meals[date][id];
  const old=[plan.macMealZone,plan.macMeals];
  plan.macMealZone=zone();plan.macMeals=meals;
  if(!persist(false)){[plan.macMealZone,plan.macMeals]=old;byId('week-status').textContent='Could not save that change.';return;}
  renderToday();renderWeek();renderDueReminders();byId('week-status').textContent='Saved for '+date+' in Alongside and new calendar downloads.';
}
if(location.origin==='http://127.0.0.1:4175'){
  byId('week-calendar-picker').href='http://127.0.0.1:4174/apple-calendar.html?from=breeze';
}
function weekDates() {
  const start=Date.parse(dayKey()+'T12:00:00Z');
  return Array.from({length:7},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
}
function renderWeek() {
  if (!profile) return;
  byId('mac-calendar-actions').hidden=!macHost;
  byId('mac-connect').textContent=record().macConnected?'Refresh Mac Calendar':'Connect Mac Calendar';
  byId('mac-disconnect').hidden=!record().macConnected;
  const dates=weekDates(), daySelect=byId('week-day'), selected=daySelect.value;
  const dateLabel=date=>new Intl.DateTimeFormat(interfaceLocale(),{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  daySelect.replaceChildren(...dates.map(date=>new Option(dateLabel(date),date)));
  if(dates.includes(selected)) daySelect.value=selected;
  const added=byId('added-busy-times');
  const stamp=new Intl.DateTimeFormat(interfaceLocale(),{timeZone:zone(),weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  added.replaceChildren(...weekBusy.map((block,index)=>{
    const label=stamp.formatRange(block.start,block.end);
    const row=element('li',label), remove=element('button','Remove','action outline');
    remove.type='button';
    remove.setAttribute('aria-label','Remove busy time '+label);
    remove.onclick=()=>{
      weekBusy.splice(index,1);
      renderWeek();
      byId('week-status').textContent='Removed '+label+'.';
      const buttons=added.querySelectorAll('button');
      (buttons[Math.min(index,buttons.length-1)] || byId('week-day')).focus();
    };
    row.append(remove);return row;
  }));
  added.hidden=!weekBusy.length;
  byId('week-clear').hidden=!weekBusy.length;
  const out=byId('week-days'), plan=record();
  out.replaceChildren();
  for(const date of dates) {
    const section=element('details','','panel stack'), slots=schedule(plan,date);
    const time=checkinAt(plan,date);
    const items=[...slots.map(s=>({...s,minutes:s.kind==='meals'?30:5})),{id:'checkin',name:'Daily check-in',time}];
    const conflicts=AlongsideAppleCalendar.compare(items,[...macBusy,...weekBusy],date,zone(),zonedToUtc);
    section.open=conflicts.length>0;
    section.append(element('summary',dateLabel(date)+(conflicts.length?' · Scheduling conflict':'')));
    const list=element('ul','','entries');
    for(const slot of items.sort((a,b)=>a.time.localeCompare(b.time))) {
      const conflict=conflicts.find(c=>c.id===slot.id);
      const row=element('li',translate(slot.name)+' · '+formatTime(slot.time));
      if(conflict) {
        const clock=new Intl.DateTimeFormat(interfaceLocale(),{timeZone:zone(),hour:'numeric',minute:'2-digit'});
        row.append(element('p','Busy '+clock.format(conflict.busy.start)+' – '+clock.format(conflict.busy.end)));
        if(slot.kind==='meals' || slot.kind==='snacks'){
          const next=conflict.earlier || conflict.later;
          if(next){
            const move=element('button','Move '+translate(slot.name)+' to '+formatTime(next),'action outline');
            move.type='button';move.onclick=async()=>{
              if(macHost && record().macConnected && !await readMacCalendar())return;
              const fresh=AlongsideAppleCalendar.compare(items,[...macBusy,...weekBusy],date,zone(),zonedToUtc).find(c=>c.id===slot.id);
              if(!fresh || ![fresh.earlier,fresh.later].includes(next)){byId('week-status').textContent='Availability changed. Review the updated week.';renderWeek();return;}
              saveMacMeal(date,slot.id,next);
            };row.append(move);
          } else row.append(element('small','No nearby opening found.'));
          const keep=element('button','Keep '+formatTime(slot.time),'action outline');keep.type='button';
          keep.onclick=()=>{byId('week-status').textContent=translate(slot.name)+' stays at '+formatTime(slot.time)+' on '+date+'.';};row.append(keep);
        }
      }
      if(plan.macMealZone===zone() && plan.macMeals?.[date]?.[slot.id]){
        const undo=element('button','Restore usual meal time','action outline');undo.type='button';undo.onclick=()=>saveMacMeal(date,slot.id,null);row.append(undo);
      }
      if(slot.id==='checkin' && conflict) {
        const next=conflict.later || conflict.earlier;
        if(next) {
          const apply=element('button','Move this check-in to '+formatTime(next),'action outline');
          apply.type='button';apply.onclick=()=>saveWeekDate(date,next);row.append(apply);
        } else row.append(element('small','No nearby free time found. Keep the current time.'));
      }
      if(slot.id==='checkin' && plan.weekZone===zone() && plan.weekCheckins?.[date]) {
        const undo=element('button','Restore usual time · '+formatTime(plan.checkinTime || '20:00'),'action outline');
        undo.type='button';undo.onclick=()=>saveWeekDate(date,null);row.append(undo);
      }
      list.append(row);
    }
    section.append(list);out.append(section);
  }
}
function saveWeekDate(date,time) {
  const plan=record(), dates=weekDates();
  if(!profile || !dates.includes(date))return;
  const prior=plan.weekCheckins, priorZone=plan.weekZone;
  const entries=priorZone===zone()?Object.fromEntries(Object.entries(prior||{}).filter(([d])=>dates.includes(d))):{};
  if(time)entries[date]=time;else delete entries[date];
  plan.weekCheckins=entries;plan.weekZone=zone();
  if(!persist(false)){
    plan.weekCheckins=prior;plan.weekZone=priorZone;
    byId('week-status').textContent='Could not save this change.';return;
  }
  byId('week-status').textContent='Saved for '+date+' · Daily check-in · '+formatTime(checkinAt(plan,date))+'. Applies in Alongside and new calendar downloads.';
  renderWeek();renderDailyPrompt();renderDueReminders();
}
byId('week-busy-form').onsubmit=event=>{
  event.preventDefault();
  const date=byId('week-day').value, start=byId('week-start').value, end=byId('week-end').value;
  const status=byId('week-status');
  if(end<=start){status.textContent='Choose an end time after the start.';return;}
  weekBusy.push({start:+zonedToUtc(date,start,zone()),end:+zonedToUtc(date,end,zone())});
  status.textContent='Added '+date+' · '+formatTime(start)+' – '+formatTime(end)+' · '+zone();renderWeek();
};
byId('week-clear').onclick=()=>{weekBusy=[];byId('week-status').textContent='Busy times cleared.';renderWeek();};
function reminderPlan(draft=record()) {
  const slots=schedule(draft).filter(slot=>slot.kind!=="water" || withinWaterWindow(slot.time,draft))
    .map(({id,time})=>({id,time}));
  slots.push({id:"checkin",time:draft.checkinTime || "20:00"});
  const result={timeZone:zone(),discreet:draft.settings.discreet!==false,slots};
  const review=draft.appleDay;
  if(!review || review.zone!==result.timeZone || review.date!==dayKey())return result;
  const overrides=slots.filter(slot=>review.moves?.[slot.id] && review.moves[slot.id]!==slot.time)
    .map(slot=>({date:review.date,id:slot.id,time:review.moves[slot.id]}));
  if(overrides.length)result.overrides=overrides;
  if(review.share){
    const conflicts=review.items.filter(item=>slots.some(slot=>slot.id===item.id && (review.moves?.[slot.id] ?? slot.time)===item.time))
      .map(({date,id,time})=>({date,id,time}));
    if(conflicts.length)result.conflicts=conflicts;
  }
  return result;
}
async function saveReminderChange(patch,status,success='') {
  if(editingReminders)return false;
  const original=record(), owner=profile?.id;
  if(!owner)return false;
  const draft={...original,...patch};
  const previous=reminderPlan(original).slots.filter(s=>s.id!=="checkin");
  const nextPlan=reminderPlan(draft), next=nextPlan.slots;
  const nextTimes=new Set(next.filter(s=>s.id!=="checkin").map(s=>s.time));
  // Removing a category must also correct an older connected plan, even if today’s local
  // snack happens to overlap lunch. The server intersects with the times it actually has.
  const optOut=patch.settings && (original.settings.snacks && !draft.settings.snacks || original.settings.water && !draft.settings.water);
  const mustNarrow=optOut || previous.some(s=>!nextTimes.has(s.time));
  editingReminders=true;
  try{
    status.textContent='';
    if(whatsappController && !await whatsappController.reconcileSavedPlan(next,nextPlan)){
      status.textContent='Change not saved. WhatsApp could not confirm the new schedule. Try again or reply STOP in WhatsApp.';
      return false;
    }
    if(profile?.id!==owner || record()!==original)return false;
    const oldValues=Object.fromEntries(Object.keys(patch).map(k=>[k,original[k]]));
    Object.assign(original,patch);
    if(!persist(false)){
      Object.assign(original,oldValues);
      await whatsappController?.reconcileSavedPlan(reminderPlan(original).slots);
      status.textContent='Your changes could not be saved on this device. Please try again.';
      return false;
    }
    whatsappController?.render();
    const updated=await calendarController?.refresh();
    if(profile?.id!==owner || record()!==original)return false;
    status.textContent=updated===false
      ? 'Saved on this device. Your calendar feed could not update. Retry in Calendar reminders.'
      : mustNarrow && calendarController?.isConnected()
        ? 'Reminder times updated. Your calendar app may show old events until it refreshes.'
        : success;
    return true;
  }finally{editingReminders=false;}
}
function renderAppleReview(){
  const out=byId('apple-busy-review'), status=byId('apple-busy-status');
  if(!out)return;
  out.replaceChildren();
  const owner=profile?.id, date=dayKey(), timeZone=zone();
  if(!owner || !hasAgeGroup()){pendingAppleCheck=null;return;}
  if(pendingAppleCheck && (pendingAppleCheck.owner!==owner || pendingAppleCheck.date!==date))pendingAppleCheck=null;
  const review=record().appleDay;
  const today=review?.date===date && review.zone===timeZone ? review : {date,zone:timeZone,moves:{},items:[],kept:[],share:false};
  const slots=schedule(record(),date).filter(s=>s.kind==='meals'||s.kind==='snacks');
  function text(line){out.append(element('p',line));}
  function action(label,handler){
    const b=element('button',label,'action outline');b.type='button';
    b.addEventListener('click',async()=>{if(editingReminders)return;b.disabled=true;try{await handler();}finally{b.disabled=false;}});out.append(b);
  }
  async function save(next,message){
    if(profile?.id!==owner || dayKey()!==date || zone()!==timeZone)return false;
    if(!await saveReminderChange({appleDay:next},status,message))return false;
    renderToday();renderAppleReview();return true;
  }
  if(pendingAppleCheck?.error){
    text('This calendar check could not be read. Run the shortcut again.');return;
  }
  if(pendingAppleCheck){
    const incoming=pendingAppleCheck;
    text('Compare these appointment times with today’s meals and snacks on this device?');
    action('Check for overlaps',async()=>{
      const found=AlongsideAppleCalendar.compare(slots,incoming.ranges,date,timeZone,zonedToUtc);
      const items=found.filter(i=>!today.kept?.includes(i.id+'@'+i.time));
      if(await save({...today,items,checked:true},'Calendar check saved.')){
        pendingAppleCheck=null;renderAppleReview();
      }
    });
    action('Discard calendar check',()=>{pendingAppleCheck=null;renderAppleReview();});return;
  }
  if(!today.checked)return;
  const items=today.items.filter(i=>slots.some(s=>s.id===i.id && s.time===i.time) && +zonedToUtc(date,i.time,timeZone)>Date.now());
  if(!items.length)text('Today’s check has no remaining overlaps to review.');
  for(const item of items){
    const slot=slots.find(s=>s.id===item.id);
    text(slot.name+' at '+formatTime(item.time)+' overlaps with a busy time today. Keep it or move just today’s reminder.');
    async function decide(time){
      const next={...today,items:today.items.filter(i=>i.id!==item.id),kept:[...(today.kept||[]),item.id+'@'+item.time]};
      if(time){
        if(+zonedToUtc(date,time,timeZone)<=Date.now() || slots.some(s=>s.id!==item.id && s.time===time)){
          status.textContent='That time is no longer available. Run the shortcut again.';return;
        }
        next.moves={...today.moves,[item.id]:time};
      }
      await save(next,time?'Today’s reminder moved to '+formatTime(time)+'.':'Today’s reminder keeps its original time.');
    }
    action('Keep '+formatTime(item.time),()=>decide(''));
    for(const [label,time] of [['Earlier',item.earlier],['Later',item.later]]){
      if(time && +zonedToUtc(date,time,timeZone)>Date.now())action(label+' · '+formatTime(time),()=>decide(time));
    }
  }
  if(today.share)action('Turn off today’s overlap alerts',()=>save({...today,share:false},'Overlap alerts turned off.'));
  action('Clear this calendar check',()=>save({...today,checked:false,share:false,items:[],kept:[]},'Calendar check cleared. Your chosen reminder times were kept.'));
}

function syncReminderPlan() {
  if(whatsappController && !editingReminders)void reconcileSavedReminders();
  whatsappController?.render();
  calendarController?.refresh();
}
async function disconnectReminders() {
  try {
    if(whatsappController && !await whatsappController.disconnect())return false;
    return calendarController ? (await calendarController.disconnect()) !== false : true;
  } catch {return false;}
}
const reminderOptions={document,storage:account?.storage ?? localStorage,getProfileId:()=>profile?.id,
  getPlan:reminderPlan, canShare:()=>hasAgeGroup() && profile?.ageGroup!=="child", canConnect:()=>hasAgeGroup() && profile?.ageGroup!=="child", translate};
whatsappController=globalThis.AlongsideWhatsApp.mount(reminderOptions);
calendarController=globalThis.AlongsideCalendar.mount({...reminderOptions,container:byId("calendar-connect")});
async function reconcileSavedReminders(){
  const id=profile?.id;
  if(!id)return;
  if(!await whatsappController.reconcileSavedPlan(reminderPlan().slots) && profile?.id===id){
    byId("reminder-change-status").textContent="WhatsApp could not confirm your reminder times. Reopen Reminders to retry or reply STOP in WhatsApp.";
  }
}
void reconcileSavedReminders();
window.addEventListener("focus",()=>{if(location.hash==="#reminders")void whatsappController.refresh(true).then(()=>reconcileSavedReminders());});
initializeRecoveryUpdate();
initializeFreeFeatures();
renderSources();
renderProfile();
renderRoute(false);
initializeLanguageControls();

if (account) {
  byId("account-controls").hidden=false;
  byId("sign-out").addEventListener("click",async ()=>{
    if(account.kids && !await disconnectReminders()){byId("settings-status").textContent="Your reminders could not be disconnected. Check your connection and try again.";return;}
    await account.signOut();
  });
}
