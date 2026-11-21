"use strict";
(() => {
  const {names, keys, values} = globalThis.AlongsideLocaleData;
  const indices = new Map(keys.map((key, index) => [key, index]));
  function baseLanguage(code) {
    try {
      const base = new Intl.Locale(code).language;
      return Object.hasOwn(names, base) ? base : "en";
    } catch { return "en"; }
  }
  const substitutions = [
    [/^Welcome, (.+)\.$/, "Welcome, {name}.", ["name"]],
    [/^Question (\d+) \/ (\d+)$/, "Question {current} / {total}", ["current", "total"]],
    [/^(\d+) specific pages approved for Alongside’s information library\.$/, "{count} specific pages approved for Alongside’s information library.", ["count"]],
    [/^Delete check-in (\d+)$/, "Delete check-in {count}", ["count"]],
    [/^Selected fictional Luna demo · expires (.+)$/, "Selected fictional Luna demo · expires {date}", ["date"]]
  ];

  function translate(text, language) {
    const pack = values[language === "zh-Hans" ? "zh" : language];
    if (!pack) return text;
    if (indices.has(text)) return pack[indices.get(text)];
    for (const [pattern, key, names] of substitutions) {
      const match = text.match(pattern);
      if (match) return pack[indices.get(key)].replace(/\{(\w+)\}/g, (_, name) => match[1 + names.indexOf(name)]);
    }
    for (const suffix of [" reminder seen", " reminder marked as seen.", " reminder unmarked."]) {
      if (text.endsWith(suffix)) return translate(text.slice(0, -suffix.length), language) + " · " + translate(suffix.trim(), language);
    }
    if (text.includes(" · ")) return text.split(" · ").map(part => translate(part, language)).join(" · ");
    if (text.endsWith(".") && indices.has(text.slice(0, -1))) return pack[indices.get(text.slice(0, -1))] + ".";
    return text;
  }

  // Remember both forms so a later language change starts with the original wording.
  function makeRenderer() {
    const texts = new WeakMap();
    const attributes = new WeakMap();
    function renderValue(memory, key, current, lookup) {
      const previous = memory.get(key);
      const original = previous?.displayed === current ? previous.original : current;
      const displayed = original.replace(/\S[\s\S]*\S|\S/, part => lookup(part));
      memory.set(key, {original, displayed});
      return displayed;
    }
    return function render(lookup) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest("script,style,textarea,datalist,[data-user-content]")) continue;
        const value = renderValue(texts, node, node.nodeValue, lookup);
        if (node.nodeValue !== value) node.nodeValue = value;
      }
      for (const element of document.querySelectorAll("[aria-label],[placeholder],[alt]")) {
        if (!attributes.has(element)) attributes.set(element, new Map());
        for (const name of ["aria-label","placeholder","alt"]) {
          if (!element.hasAttribute(name)) continue;
          const before = element.getAttribute(name);
          const after = renderValue(attributes.get(element), name, before, lookup);
          if (before !== after) element.setAttribute(name, after);
        }
      }
    };
  }

  globalThis.AlongsideLocale = {names, baseLanguage, translate, makeRenderer};
  if (document.getElementById("preferred-language")) return;
  const render = makeRenderer();
  const title = document.title;
  const observer = new MutationObserver(refresh);
  function refresh() {
    observer.disconnect();
    let code = "en";
    try { code = localStorage.getItem("alongside-interface-language") || "en"; } catch {}
    const locale = baseLanguage(code);
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    render(text => translate(text, locale));
    document.title = translate(title, locale);
    observer.observe(document.body, {childList:true, characterData:true, subtree:true});
  }
  refresh();
  window.addEventListener("storage", refresh);
})();
