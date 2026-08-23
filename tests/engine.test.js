const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../data.js");
const engine = require("../app.js");

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? values.at(-1);
}

test("all encounter tables cover every die result exactly once", () => {
  for (const [key, table] of Object.entries(data.tables)) {
    for (let roll = 1; roll <= table.die; roll += 1) {
      const matches = table.entries.filter((entry) => roll >= entry.min && roll <= entry.max);
      assert.equal(matches.length, 1, `${key}: результат ${roll}`);
      assert.ok(data.events[matches[0].name], `${key}: описание ${matches[0].name}`);
    }
  }
});

test("known boundary rolls resolve to correct outer-city events", () => {
  assert.equal(engine.findEntry(data.tables.outer.entries, 1).name, "Выгнаны из Города");
  assert.equal(engine.findEntry(data.tables.outer.entries, 4).name, "Выгнаны из Города");
  assert.equal(engine.findEntry(data.tables.outer.entries, 5).name, "Незваные Гости");
  assert.equal(engine.findEntry(data.tables.outer.entries, 100).name, "Двойные Проблемы");
});

test("double trouble produces two non-double encounters", () => {
  const rng = sequence([0.999, 0.999, 0.0, 0.999, 0.20]);
  const result = engine.rollEncounter("outer", rng);
  assert.equal(result.entry.name, "Двойные Проблемы");
  assert.equal(result.children.length, 2);
  assert.notEqual(result.children[0].entry.name, "Двойные Проблемы");
  assert.notEqual(result.children[1].entry.name, "Двойные Проблемы");
});

test("scene extras use the selected dice", () => {
  const scene = engine.rollScene("sewers", { setting: true, ruin: true, find: true }, () => 0);
  assert.equal(scene.encounter.roll, 1);
  assert.equal(scene.setting.roll, 1);
  assert.equal(scene.ruin.roll, 1);
  assert.equal(scene.find.roll, 1);
});

test("Russian dice expressions return individual rolls and a total", () => {
  const result = engine.rollExpression("3к6", sequence([0, 0.5, 0.999]));
  assert.deepEqual(result.rolls, [1, 4, 6]);
  assert.equal(result.total, 11);
  assert.equal(engine.rollExpression("not-a-die"), null);
});
