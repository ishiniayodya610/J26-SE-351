const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/services/api.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ response = { status: 200, body: JSON.stringify({ success: true, data: { common_name: 'Betta' } }) }, timeout = false, offline = false, env = {} } = {}) {
  let uploads = 0, cancellations = 0;
  const task = {
    uploadAsync: async () => { uploads++; if (timeout) return new Promise(() => {}); return response; },
    cancelAsync: async () => { cancellations++; },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, URL, AbortController, FormData, console, process: { env },
    setTimeout: (fn, ms) => timeout && ms === 120000 ? setImmediate(fn) : setTimeout(fn, ms),
    clearTimeout: id => { clearTimeout(id); clearImmediate(id); },
    fetch: async () => { if (offline) throw new Error('offline'); return { ok: true }; },
    require: name => {
      if (name === 'react-native') return { Platform: { OS: 'ios' }, NativeModules: { SourceCode: { getConstants: () => ({ scriptURL: 'http://192.168.8.128:8081/entry.bundle' }) } } };
      if (name === 'expo-constants') return { default: { expoConfig: null } };
      if (name === 'expo-file-system/legacy') return { createUploadTask: () => task, FileSystemUploadType: { MULTIPART: 1 }, FileSystemSessionType: { FOREGROUND: 1 } };
      throw new Error(name);
    },
  });
  return { ...exports, counts: () => ({ uploads, cancellations }) };
}
(async () => {
  let test = setup();
  assert.equal(test.API_BASE_URL, 'http://192.168.8.128:8000');
  assert.equal((await test.api.analyzeVideo('file:///clip.mov')).common_name, 'Betta');
  assert.equal(test.counts().uploads, 1);
  assert.equal(setup({ env: { EXPO_PUBLIC_API_URL: 'http://custom:8000' } }).API_BASE_URL, 'http://custom:8000');
  test = setup({ response: { status: 503, body: JSON.stringify({ detail: 'Model unavailable' }) } });
  await assert.rejects(test.api.analyzeVideo('file:///clip.mov'), /Model unavailable/);
  assert.equal(test.counts().uploads, 1);
  test = setup({ offline: true });
  await assert.rejects(test.api.analyzeVideo('file:///clip.mov'), /Cannot reach the backend/);
  assert.equal(test.counts().uploads, 0);
  test = setup({ timeout: true });
  await assert.rejects(test.api.analyzeVideo('file:///clip.mov'), /timed out/);
  assert.equal(test.counts().cancellations, 1);
  console.log('PASS: host fallback, host override, native upload, no retry, offline handling, timeout cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
