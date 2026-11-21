"use strict";
(() => {
  const packs = globalThis.AlongsideLanguagePacks;
  const substitutions = [
    [/^Welcome, (.+)\.$/, "Welcome, {name}.", ["name"]],
    [/^Question (\d+) \/ (\d+)$/, "Question {current} / {total}", ["current", "total"]],
    [/^(\d+) specific pages approved for Alongside’s information library\.$/, "{count} specific pages approved for Alongside’s information library.", ["count"]],
    [/^Delete check-in (\d+)$/, "Delete check-in {count}", ["count"]],
    [/^Selected fictional Luna demo · expires (.+)$/, "Selected fictional Luna demo · expires {date}", ["date"]]
  ];

  function translate(text, language) {
    const pack = packs[language];
    if (!pack) return text;
    if (Object.hasOwn(pack, text)) return pack[text];
    for (const [pattern, key, names] of substitutions) {
      const match = text.match(pattern);
      if (match && pack[key]) return pack[key].replace(/\{(\w+)\}/g, (_, name) => match[1 + names.indexOf(name)]);
    }
    for (const suffix of [" reminder seen", " reminder marked as seen.", " reminder unmarked."]) {
      if (text.endsWith(suffix)) return translate(text.slice(0, -suffix.length), language) + " · " + translate(suffix.trim(), language);
    }
    if (text.includes(" · ")) return text.split(" · ").map(part => translate(part, language)).join(" · ");
    if (text.endsWith(".") && Object.hasOwn(pack, text.slice(0, -1))) return pack[text.slice(0, -1)] + ".";
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

  globalThis.AlongsideLocale = {packs, translate, makeRenderer};
  if (document.getElementById("language-registry")) return;
  const render = makeRenderer();
  const title = document.title;
  const observer = new MutationObserver(refresh);
  function refresh() {
    observer.disconnect();
    let code = "en";
    try { code = (localStorage.getItem("alongside-interface-language") || "en").split("-")[0]; } catch {}
    const locale = Object.hasOwn(packs, code) ? code : "en";
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    render(text => translate(text, locale));
    document.title = translate(title, locale);
    observer.observe(document.body, {childList:true, characterData:true, subtree:true});
  }
  refresh();
  window.addEventListener("storage", refresh);
})();
