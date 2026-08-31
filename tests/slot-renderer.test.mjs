import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function reactStub() {
  return {
    createElement(type, rawProps, ...children) {
      const props = { ...(rawProps || {}) }
      if (children.length === 1) props.children = children[0]
      else if (children.length > 1) props.children = children
      return { type, props }
    },
    useRef(value) { return { current: value } },
    useMemo(factory) { return factory() },
    useState(value) { return [typeof value === 'function' ? value() : value, () => {}] },
    useLayoutEffect() {},
  }
}

function loadClient(storage = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  })
  const w = dom.window
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value)
  const sandbox = {
    window: w,
    document: w.document,
    location: w.location,
    console,
    setTimeout: w.setTimeout.bind(w),
    clearTimeout: w.clearTimeout.bind(w),
    setInterval: w.setInterval.bind(w),
    clearInterval: w.clearInterval.bind(w),
  }
  w.__ModuleLoader__ = { load(handoff) { sandbox.handoff = handoff } }
  vm.runInNewContext(clientCode, sandbox)
  const exports = sandbox.handoff.factory(() => reactStub())
  return { dom, window: w, exports }
}

function createSlots(initialEntries = []) {
  const entries = initialEntries.slice()
  const listeners = new Set()
  let rawRegistrations = 0

  function notify() {
    for (const listener of [...listeners]) listener()
  }

  const slots = {
    inject(name, setup) {
      assert.equal(name, 'conversation.chat.node')
      const dispose = setup()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    entries(name) {
      assert.equal(name, 'conversation.chat.node')
      return entries
    },
    subscribe(name, listener) {
      assert.equal(name, 'conversation.chat.node')
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    register(options, component) {
      const priority = options.priority ?? 0
      const duplicate = entries.find(entry => entry.options.key === options.key
        && (entry.options.priority ?? 0) === priority)
      if (duplicate) throw new Error('duplicate key+priority')
      const entry = { component, options: { ...options }, locale: options.locale }
      entries.push(entry)
      entries.sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))
      if (options.key === 'assistant-step' && priority === -1) rawRegistrations += 1
      notify()
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        const index = entries.indexOf(entry)
        if (index !== -1) entries.splice(index, 1)
        notify()
      }
    },
  }

  return {
    slots,
    entries,
    listenerCount: () => listeners.size,
    rawRegistrations: () => rawRegistrations,
    mutate: notify,
  }
}

function OfficialAssistant(props) {
  return { official: true, props }
}

function officialEntry() {
  return {
    component: OfficialAssistant,
    options: { key: 'assistant-step', priority: 0 },
    locale: 'conversation',
  }
}

test('native DSH settings section registers as its own navigation page', () => {
  const client = loadClient()
  let registration = null
  let disposed = false
  const slots = {
    inject(name, setup) {
      assert.equal(name, 'settings.section')
      const dispose = setup()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    register(options, component) {
      registration = { options, component }
      return () => { disposed = true }
    },
  }
  const handle = client.exports.registerNativeSettings({ slots })
  assert.equal(handle.isMounted(), true)
  assert.equal(registration.options.id, 'raw-html')
  assert.equal(registration.options.order, 90)
  assert.equal(registration.options.label, 'VCP 渲染')
  assert.equal(registration.component, client.exports.RawHtmlSettingsSection)
  handle.dispose()
  assert.equal(disposed, true)
})

test('existing official assistant is shadowed at priority -1', () => {
  const client = loadClient()
  const registry = createSlots([officialEntry()])
  const dispose = client.exports.registerAssistantRenderer({ slots: registry.slots })
  assert.deepEqual(registry.entries.map(entry => entry.options.priority), [-1, 0])
  assert.equal(registry.entries[0].component, client.exports.RawHtmlAssistant)
  assert.equal(registry.rawRegistrations(), 1)
  dispose()
})

test('late official registration is observed exactly once and subscription is released', () => {
  const client = loadClient()
  const registry = createSlots()
  const dispose = client.exports.registerAssistantRenderer({ slots: registry.slots })
  assert.equal(registry.listenerCount(), 1)
  registry.slots.register({ name: 'conversation.chat.node', key: 'assistant-step' }, OfficialAssistant)
  assert.equal(registry.rawRegistrations(), 1)
  assert.equal(registry.listenerCount(), 0)
  registry.mutate()
  registry.mutate()
  assert.equal(registry.rawRegistrations(), 1)
  assert.equal(registry.entries.filter(entry => entry.options.priority === -1).length, 1)
  dispose()
  assert.equal(registry.entries.filter(entry => entry.options.priority === -1).length, 0)
  assert.equal(registry.listenerCount(), 0)
})

test('dispose before late registration cancels the watcher', () => {
  const client = loadClient()
  const registry = createSlots()
  const dispose = client.exports.registerAssistantRenderer({ slots: registry.slots })
  dispose()
  assert.equal(registry.listenerCount(), 0)
  registry.slots.register({ name: 'conversation.chat.node', key: 'assistant-step' }, OfficialAssistant)
  assert.equal(registry.rawRegistrations(), 0)
})

test('ordinary messages and renderer OFF reuse the official Assistant', () => {
  const client = loadClient({ 'dsh.rawHtml': '0' })
  const registry = createSlots([officialEntry()])
  client.exports.registerAssistantRenderer({ slots: registry.slots })
  const props = { node: { data: { status: 'settled', blocks: [{ kind: 'text', text: '<div id="vcp-root">x</div>' }] } } }
  assert.equal(client.exports.RawHtmlAssistant(props).type, OfficialAssistant)
  client.window.localStorage.setItem('dsh.rawHtml', '1')
  const plain = { node: { data: { status: 'settled', blocks: [{ kind: 'text', text: 'plain markdown' }] } } }
  assert.equal(client.exports.RawHtmlAssistant(plain).type, OfficialAssistant)
})

test('a #vcp-root block enters RawHtmlCard while surrounding text stays official', () => {
  const client = loadClient({ 'dsh.rawHtml': '1' })
  const registry = createSlots([officialEntry()])
  client.exports.registerAssistantRenderer({ slots: registry.slots })
  const props = {
    node: {
      data: {
        status: 'running',
        blocks: [{ kind: 'text', text: 'before\n<div id="vcp-root"><p>card</p></div>\nafter' }],
      },
    },
  }
  const rendered = client.exports.RawHtmlAssistant(props)
  assert.equal(rendered.type, 'div')
  assert.equal(rendered.props['data-vcp-assistant'], 'true')
  const children = rendered.props.children
  assert.equal(children.length, 3)
  assert.equal(children[1].type, client.exports.RawHtmlCard)
  assert.equal(children[1].props.streaming, true)
  assert.match(children[1].props.html, /id="vcp-root"/)
})

test('renderer exceptions fall back to the official Assistant', () => {
  const client = loadClient({ 'dsh.rawHtml': '1' })
  const registry = createSlots([officialEntry()])
  client.exports.registerAssistantRenderer({ slots: registry.slots })
  const data = { status: 'settled' }
  Object.defineProperty(data, 'blocks', { get() { throw new Error('boom') } })
  const rendered = client.exports.RawHtmlAssistant({ node: { data } })
  assert.equal(rendered.type, OfficialAssistant)
})

test('safe sanitizer blocks executable content, unsafe URLs and CSS escapes', () => {
  const client = loadClient()
  const html = [
    '<div id="vcp-root">',
    '<script>window.__ran=1</script>',
    '<iframe src="https://evil.example"></iframe>',
    '<object data="https://evil.example"></object>',
    '<embed src="https://evil.example">',
    '<a href="javascript:alert(1)">bad</a>',
    '<img src="x.png" onerror="window.__ran=2">',
    '<button onclick="input(\'send me\')">send</button>',
    '<style>@import "https://evil.example/x.css";p{position:fixed;background:url(javascript:alert(1))}</style>',
    '</div>',
  ].join('')
  const out = client.exports.sanitizeVcpHtml(html)
  assert.match(out, /id="vcp-root"/)
  assert.doesNotMatch(out, /<(?:script|iframe|object|embed)\b/i)
  assert.doesNotMatch(out, /javascript:/i)
  assert.doesNotMatch(out, /onerror|onclick/i)
  assert.match(out, /data-vcp-input="send me"/)
  assert.doesNotMatch(out, /@import|position\s*:\s*fixed/i)
  assert.equal(client.window.__ran, undefined)
})

test('Trusted Mode executes each script once with Shadow DOM document lookup', () => {
  const client = loadClient({ 'raw-html.trusted': '1' })
  const prepared = client.exports.prepareVcpHtml(
    '<div id="vcp-root"><canvas id="scene"></canvas>' +
      '<script>window.__ran=(window.__ran||0)+1;var ok=1 &amp;&amp; 2;window.__entity=ok;document.getElementById("scene").setAttribute("data-ready","yes")</script>' +
      '<iframe src="https://example.com"></iframe></div>',
    true,
  )
  assert.equal(prepared.scripts.length, 1)
  assert.match(prepared.html, /<iframe\b/i)
  assert.doesNotMatch(prepared.html, /<script\b/i)
  const host = client.window.document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = prepared.html
  const executed = {}
  client.exports.runTrustedScripts(shadow, prepared.scripts, executed)
  client.exports.runTrustedScripts(shadow, prepared.scripts, executed)
  assert.equal(client.window.__ran, 1)
  assert.equal(client.window.__entity, 2)
  assert.equal(shadow.getElementById('scene').getAttribute('data-ready'), 'yes')
})

test('streaming DOM updater preserves completed node identity', () => {
  const client = loadClient()
  const container = client.window.document.createElement('div')
  client.exports.updateStableContent(container, '<div id="vcp-root"><p id="done">stable</p><span>a</span></div>')
  const root = container.firstElementChild
  const completed = root.querySelector('#done')
  client.exports.updateStableContent(container, '<div id="vcp-root"><p id="done">stable</p><span>ab</span></div>')
  assert.equal(container.firstElementChild, root)
  assert.equal(root.querySelector('#done'), completed)
  assert.equal(root.querySelector('span').textContent, 'ab')
})
