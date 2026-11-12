const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');

for (const parent of ['rehype-katex', 'micromark-extension-math']) {
  const parentRequire = createRequire(require.resolve(parent));
  const katex = parentRequire('katex');

  for (const trust of [true, () => true]) {
    test(`${parent} ignores inherited trust ${typeof trust}`, () => {
      const options = Object.create({ trust });
      options.throwOnError = false;
      const rendered = katex.renderToString('\\href{https://attacker.example/}{click}', options);
      assert.ok(!rendered.includes('href="https://attacker.example/"'));
    });
  }

  test(`${parent} preserves ordinary math and explicitly trusted links`, () => {
    assert.ok(katex.renderToString('x^2').includes('katex'));
    assert.ok(katex.renderToString('\\href{https://docs.example/}{docs}', { trust: true })
      .includes('href="https://docs.example/"'));
  });
}
