(function (root, factory) {
  const api = factory(root.DRAKKENHEIM_DATA || (typeof require === "function" ? require("./data.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EncounterEngine = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => api.init());
    else api.init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (data) {
  "use strict";

  const HISTORY_KEY = "drakkenheim-roll-history-v1";

  function rollDie(sides, rng = Math.random) {
    return Math.floor(rng() * sides) + 1;
  }

  function findEntry(entries, roll) {
    return entries.find((entry) => roll >= entry.min && roll <= entry.max);
  }

  function formatRange(entry) {
    return entry.min === entry.max ? String(entry.min) : `${entry.min}–${entry.max}`;
  }

  function rollEncounter(locationKey, rng = Math.random, ignoreDouble = false) {
    const table = data.tables[locationKey];
    if (!table) throw new Error(`Неизвестная локация: ${locationKey}`);

    let roll;
    let entry;
    let attempts = 0;
    do {
      roll = rollDie(table.die, rng);
      entry = findEntry(table.entries, roll);
      attempts += 1;
      if (!entry) throw new Error(`В таблице ${locationKey} нет результата для ${roll}`);
    } while (ignoreDouble && data.events[entry.name].special === "double" && attempts < 100);

    if (ignoreDouble && data.events[entry.name].special === "double") {
      entry = table.entries.find((candidate) => data.events[candidate.name].special !== "double");
      roll = entry.min;
    }

    const result = { roll, die: table.die, entry, event: data.events[entry.name], locationKey, locationLabel: table.label };
    if (result.event.special === "double" && !ignoreDouble) {
      result.children = [rollEncounter(locationKey, rng, true), rollEncounter(locationKey, rng, true)];
    }
    return result;
  }

  function rollTable(entries, sides, rng = Math.random) {
    const roll = rollDie(sides, rng);
    const entry = Array.isArray(entries) && typeof entries[0] === "string"
      ? { min: roll, max: roll, name: entries[roll - 1] }
      : findEntry(entries, roll);
    return { roll, die: sides, entry };
  }

  function rollScene(locationKey, options = {}, rng = Math.random) {
    const scene = {
      createdAt: new Date().toISOString(),
      encounter: rollEncounter(locationKey, rng)
    };
    if (options.setting) scene.setting = rollTable(data.settings, 10, rng);
    if (options.ruin) scene.ruin = rollTable(data.ruins, 10, rng);
    if (options.find) scene.find = rollTable(data.finds, 20, rng);
    return scene;
  }

  function rollExpression(expression, rng = Math.random) {
    const match = /^(\d+)к(\d+)$/i.exec(expression.trim());
    if (!match) return null;
    const count = Number(match[1]);
    const sides = Number(match[2]);
    if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
    const rolls = Array.from({ length: count }, () => rollDie(sides, rng));
    return { expression, rolls, total: rolls.reduce((sum, value) => sum + value, 0) };
  }

  function appendRichText(container, source) {
    const tokenPattern = /\[\[([^|\]]+)\|([^\]]+)\]\]|(\d+к\d+)/gi;
    let cursor = 0;
    let match;
    while ((match = tokenPattern.exec(source))) {
      container.append(document.createTextNode(source.slice(cursor, match.index)));
      if (match[1]) {
        const link = document.createElement("a");
        link.href = data.linkFor(match[2]);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = match[1];
        link.title = "Открыть статблок в новой вкладке";
        container.append(link);
      } else {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dice-expression";
        button.dataset.expression = match[3].toLowerCase();
        button.textContent = match[3];
        button.title = "Бросить этот куб";
        container.append(button);
      }
      cursor = tokenPattern.lastIndex;
    }
    container.append(document.createTextNode(source.slice(cursor)));
  }

  function createCard({ roll, die, entry, title, text, eyebrow, kind = "secondary", special = false }) {
    const template = document.querySelector("#result-template");
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".encounter-card");
    card.classList.add(kind);
    if (special) card.classList.add("double");
    fragment.querySelector(".roll-badge strong").textContent = roll;
    fragment.querySelector(".roll-badge small").textContent = `1к${die}`;
    fragment.querySelector(".encounter-card__title .eyebrow").textContent = eyebrow;
    fragment.querySelector(".encounter-card__title h2").textContent = title;
    const body = fragment.querySelector(".encounter-card__body");
    const paragraph = document.createElement("p");
    appendRichText(paragraph, text);
    body.append(paragraph);
    const footer = fragment.querySelector(".encounter-card__footer");
    const range = document.createElement("span");
    range.className = "range-chip";
    range.textContent = `Диапазон ${formatRange(entry)}`;
    footer.append(range);
    if (/\d+к\d+/i.test(text)) {
      const hint = document.createElement("span");
      hint.className = "dice-hint";
      hint.textContent = "Нажмите на формулу в тексте, чтобы бросить";
      footer.append(hint);
    }
    return fragment;
  }

  function encounterCard(result, label = "Случайное событие") {
    return createCard({
      roll: result.roll,
      die: result.die,
      entry: result.entry,
      title: result.entry.name,
      text: result.event.text,
      eyebrow: `${label} · ${result.locationLabel}`,
      kind: "primary",
      special: Boolean(result.children)
    });
  }

  function renderScene(scene) {
    const results = document.querySelector("#results");
    results.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "scene-heading";
    const headingText = document.createElement("div");
    const overline = document.createElement("p");
    overline.className = "eyebrow";
    overline.textContent = scene.encounter.locationLabel;
    const title = document.createElement("h2");
    title.textContent = "Сцена готова";
    headingText.append(overline, title);
    const stamp = document.createElement("span");
    stamp.className = "scene-number";
    stamp.textContent = new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(scene.createdAt));
    heading.append(headingText, stamp);
    results.append(heading);

    results.append(encounterCard(scene.encounter));

    if (scene.encounter.children) {
      const primaryCard = results.querySelector(".encounter-card.primary");
      const note = document.createElement("p");
      note.className = "double-note";
      note.textContent = "Два результата ниже уже переброшены без повторных «Двойных проблем». Если это две группы монстров или НПС, они сражаются друг с другом.";
      primaryCard.append(note);
      const pair = document.createElement("div");
      pair.className = "double-results";
      scene.encounter.children.forEach((child, index) => pair.append(encounterCard(child, `Встреча ${index + 1} из 2`)));
      results.append(pair);
    }

    const extraCards = [
      scene.setting && { result: scene.setting, title: "Обычная локация", eyebrow: "Обстановка", text: scene.setting.entry.name },
      scene.ruin && { result: scene.ruin, title: "Искривлённые руины", eyebrow: "Магическая аномалия", text: scene.ruin.entry.name },
      scene.find && { result: scene.find, title: "Удачная находка", eyebrow: "После случайной встречи", text: scene.find.entry.name }
    ].filter(Boolean);

    for (const item of extraCards) {
      results.append(createCard({ roll: item.result.roll, die: item.result.die, entry: item.result.entry, title: item.title, text: item.text, eyebrow: item.eyebrow }));
    }

    results.querySelector(".encounter-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  function saveHistory(scene) {
    const history = getHistory();
    history.unshift({
      createdAt: scene.createdAt,
      location: scene.encounter.locationLabel,
      roll: scene.encounter.roll,
      name: scene.encounter.entry.name,
      children: scene.encounter.children?.map((child) => child.entry.name) || []
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    updateHistory();
  }

  function updateHistory() {
    const history = getHistory();
    document.querySelector("#history-count").textContent = history.length;
    const list = document.querySelector("#history-list");
    list.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "Здесь появятся последние 30 бросков.";
      list.append(empty);
      return;
    }
    history.forEach((item) => {
      const row = document.createElement("article");
      row.className = "history-entry";
      const roll = document.createElement("span");
      roll.className = "history-entry__roll";
      roll.textContent = item.roll;
      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.children.length ? `${item.name}: ${item.children.join(" + ")}` : item.name;
      const location = document.createElement("small");
      location.textContent = item.location;
      info.append(name, location);
      const time = document.createElement("time");
      time.dateTime = item.createdAt;
      time.textContent = new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt));
      row.append(roll, info, time);
      list.append(row);
    });
  }

  function performRoll() {
    const location = document.querySelector('input[name="location"]:checked').value;
    const options = {
      setting: document.querySelector("#roll-setting").checked,
      ruin: document.querySelector("#roll-ruin").checked,
      find: document.querySelector("#roll-find").checked
    };
    const button = document.querySelector("#roll-button");
    button.classList.remove("rolling");
    void button.offsetWidth;
    button.classList.add("rolling");
    const scene = rollScene(location, options);
    renderScene(scene);
    saveHistory(scene);
    window.setTimeout(() => button.classList.remove("rolling"), 520);
  }

  function init() {
    if (!data || !document.querySelector("#roll-button")) return;
    document.querySelector("#roll-button").addEventListener("click", performRoll);
    document.addEventListener("keydown", (event) => {
      if (event.code === "Space" && !event.repeat && !/INPUT|BUTTON|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        performRoll();
      }
    });
    document.querySelector("#results").addEventListener("click", (event) => {
      const button = event.target.closest(".dice-expression");
      if (!button) return;
      const result = rollExpression(button.dataset.expression);
      button.textContent = `${result.expression} → ${result.total}`;
      button.title = result.rolls.length > 1 ? `Выпало: ${result.rolls.join(" + ")}` : `Выпало: ${result.total}`;
      button.classList.add("rolled");
    });

    const dialog = document.querySelector("#history-dialog");
    document.querySelector("#open-history").addEventListener("click", () => { updateHistory(); dialog.showModal(); });
    document.querySelector("#close-history").addEventListener("click", () => dialog.close());
    document.querySelector("#clear-history").addEventListener("click", () => { localStorage.removeItem(HISTORY_KEY); updateHistory(); });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    updateHistory();
  }

  return { rollDie, findEntry, formatRange, rollEncounter, rollTable, rollScene, rollExpression, init };
});
