#!/usr/bin/env node
/**
 * make-headless-test —— 生成「补丁产物自证页」
 * ==========================================================================
 * 目的：把 install-v7.cjs 打在 fixture 上得到 bundle 里的**真实渲染链路**抽出来，
 *       放进一个可在浏览器直接打开的测试页 —— 你打开一次即可看见
 *       「这个补丁产物到底能不能把卡片渲染成界面」。
 *
 * 做法（全部离线、不依赖任何服务）：
 *   ① fixture bootstrap 一份 → install-v7.cjs 打补丁
 *   ② 从打好的 bundle 里取出注入的 v6 模块（window.__vcpStable）
 *   ③ 取出该 bundle 的**主题/内部工具**（主题名 → 由调用方注入）——不，保持零依赖：
 *      页面只做“模块 render() → 产物 HTML 字符串”，视觉呈现用页面自带样式
 *   ④ 生成 card-headless-test.html：打开即自动渲染两张示例卡并把结果贴到页面上
 *
 * 用法：
 *   node tests/make-headless-test.cjs [输出.html]
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const SRC = process.argv[3] || path.join(ROOT, 'fixtures', 'index-015rc2-source.js')
const OUT = process.argv[2] || path.join(ROOT, 'fixtures', 'card-headless-test.html')

function extractModule(bundleSrc) {
  const a = bundleSrc.indexOf('/*__VCP_V7_MODULE__*/')
  const b = bundleSrc.indexOf('/*__VCP_V7_MODULE_END__*/')
  if (a < 0 || b < 0) return null
  let seg = bundleSrc.slice(a, b)
  seg = seg.replace(/[\s\S]*?var f=__VCP_REACT__;\n/, '')
  return seg.replace(/\n\s*;return true\}\)\([\s\S]*$/, '').trim()
}

function main() {
  if (!fs.existsSync(SRC)) { console.error('✗ 源 fixture 不存在: ' + SRC); process.exit(1) }
  const work = path.join(os.tmpdir(), 'vcp-headless-' + Date.now() + '.js')
  fs.copyFileSync(SRC, work)
  const r = execFileSync(process.execPath, [path.join(ROOT, 'patch', 'install-v7.cjs'), work], { encoding: 'utf8' })
  console.log(r.trim().split('\n').filter((l) => /已应用|✓/.test(l)).join('\n'))
  const patched = fs.readFileSync(work, 'utf8')
  const mod = extractModule(patched)
  if (!mod) { console.error('✗ 未能从补丁产物中取出渲染模块'); process.exit(1) }
  console.log('✓ 已取出补丁产物中的渲染模块: ' + mod.length + ' 字符')

  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>VCP 补丁产物 · 无头自证页</title>
<style>
html,body{margin:0;background:#17181c;color:#c9d1d9;font-family:system-ui,'Microsoft YaHei',sans-serif}
body{padding:24px}
h1{font-size:17px;margin:0 0 6px}
.note{color:#8b949e;font-size:12.5px;line-height:1.7;margin-bottom:16px;max-width:900px}
.note b{color:#00FFFF;font-weight:400}
.box{border:1px solid #2b3038;border-radius:6px;padding:12px;margin:14px 0;background:#0f1115}
.box h2{font-size:13px;margin:0 0 8px;color:#7ee787;font-family:Consolas,monospace}
pre{background:#0a1626;color:#bfe9ff;padding:10px;border-radius:4px;overflow:auto;font-size:11.5px;line-height:1.5}
.st{font-family:Consolas,monospace;font-size:12px;margin-left:8px}
.ok{color:#7ee787}.bad{color:#ff7b72}
</style></head><body>
<h1>VCP 补丁产物 · 无头自证页</h1>
<div class="note">
本页把 <b>install-v7.cjs 打在 fixture 上所得 bundle 里的真实渲染模块</b>抽出来直接调用：
若下方两张卡都显示为“深底终端卡”，则说明<b>补丁产物本身具备渲染能力</b>；
若显示为红色错误或空，则说明补丁在此链路上确有缺陷。
（本页不依赖 dsh 前端、不依赖网络；React 的 jsx 由极小桩替代，产物是 HTML 字符串。）
</div>
<div class="box"><h2>① 卡片 A（内联样式 · 无空行）<span id="st-a" class="st"></span></h2><div id="out-a"></div>
<pre id="dbg-a"></pre></div>
<div class="box"><h2>② 卡片 B（含 &lt;style&gt; 块 · 卡内无空行）<span id="st-b" class="st"></span></h2><div id="out-b"></div>
<pre id="dbg-b"></pre></div>
<script>
/* ---- 与 v6 模块对接的最小桩（与 tests/verify-v7.cjs 同源）---- */
function wg(sv){var o={};String(sv).split(';').forEach(function(d){var i=d.indexOf(':');if(i<0)return;var k=d.slice(0,i).trim().replace(/-([a-z])/g,function(m,c){return c.toUpperCase()});o[k]=d.slice(i+1).trim()});return o}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
var VOID={br:1,hr:1,img:1,input:1,meta:1,link:1,source:1,track:1,wbr:1};
function stylify(st){if(Array.isArray(st))return st.filter(Boolean).map(stylify).join('');if(st&&typeof st==='object')return Object.keys(st).map(function(k){return k.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase()})+':'+st[k]}).join(';');return String(st||'')}
function serialize(node){
  if(node===null||node===undefined||node===false||node===true)return '';
  if(typeof node==='string'||typeof node==='number')return esc(node);
  if(Array.isArray(node))return node.map(serialize).join('');
  if(typeof node==='function')return '';
  if(typeof node!=='object')return esc(String(node));
  var type=node.type,props=node.props||{},kids=node.kids||[];
  var children=(kids&&kids.length?kids:(props.children!==undefined?[].concat(props.children):[])).map(serialize).join('');
  if(typeof type==='function')return children;
  if(typeof type==='symbol')return children;
  var tag=String(type||'div'),attrs=[];
  Object.keys(props).forEach(function(k){
    if(k==='children'||k==='key'||k==='ref'||k==='dangerouslySetInnerHTML')return;
    var v=props[k];if(v===undefined||v===null)return;
    if(k==='style'){var s2=stylify(v);if(s2)attrs.push('style="'+esc(s2)+'"');return}
    if(k==='className'){attrs.push('class="'+esc(v)+'"');return}
    attrs.push(k+'="'+esc(v)+'"');
  });
  var inner=props.dangerouslySetInnerHTML?String(props.dangerouslySetInnerHTML.__html||''):(VOID[tag]?'':children);
  return '<'+tag+(attrs.length?' '+attrs.join(' '):'')+'>'+inner+(VOID[tag]?'':'</'+tag+'>');
}
function el(type,props,kids){return {__el:true,type:type,props:props||{},kids:kids||[]}}
var jsx={Fragment:Symbol.for('Fragment'),jsx:function(t,p){return el(t,p)},jsxs:function(t,p){return el(t,p)},createElement:function(t,p){var k=[].slice.call(arguments,2);return el(t,p,k)}};
function vc(node,key){
  if(!node)return null;
  if(node.nodeType===3)return node.textContent;
  if(node.nodeType!==1)return null;
  var props={key:key};
  Array.prototype.forEach.call(node.attributes||[],function(c){
    if(/^on/i.test(c.name))return;
    if(c.name==='style'){props.style=wg(c.value);return}
    if(c.name==='class'){props.className=c.value;return}
    props[c.name]=c.value;
  });
  var kids=[];
  Array.prototype.forEach.call(node.childNodes||[],function(ch){var k=vc(ch,kids.length);if(k!==null)kids.push(k)});
  return el(node.localName,props,kids);
}
/* ---- 注入补丁产物里的渲染模块 ---- */
var MODULE_SOURCE = ${JSON.stringify(mod)};
(function(){
  var stubs={document:document,DOMParser:DOMParser,localStorage:localStorage,console:console,
    setTimeout:setTimeout,clearTimeout:clearTimeout,requestAnimationFrame:requestAnimationFrame,
    cancelAnimationFrame:cancelAnimationFrame,MutationObserver:MutationObserver,ResizeObserver:ResizeObserver,
    navigator:navigator,location:location,performance:performance,getComputedStyle:getComputedStyle,
    matchMedia:window.matchMedia?window.matchMedia.bind(window):function(){return {matches:false,addEventListener:function(){},removeEventListener:function(){}}},
    f:jsx,vc:vc,wg:wg,Node:{TEXT_NODE:3,ELEMENT_NODE:1,COMMENT_NODE:8}};
  stubs.window=stubs;stubs.globalThis=stubs;stubs.self=stubs;
  try{
    (new Function('f','vc','wg','window','document','DOMParser','Node',MODULE_SOURCE))
      (jsx,vc,wg,stubs,document,DOMParser,stubs.Node);
    window.__stubs=stubs;
  }catch(e){ window.__modErr=String(e && e.message || e) }
})();
function run(id,card){
  var st=document.getElementById('st-'+id),out=document.getElementById('out-'+id),dbg=document.getElementById('dbg-'+id);
  var m=window.__stubs||{},stable=m.__vcpStable;
  if(window.__modErr){st.className='st bad';st.textContent='模块装载失败';dbg.textContent=window.__modErr;return}
  if(!stable||typeof stable.render!=='function'){st.className='st bad';st.textContent='模块未挂载 render';dbg.textContent='__vcpStable = '+typeof stable;return}
  var t0=performance.now();
  try{
    var tree=stable.render(card,false);
    var dt=Math.round(performance.now()-t0);
    if(tree===null){st.className='st bad';st.textContent='render 返回 null（'+dt+'ms）';dbg.textContent='卡片头: '+card.slice(0,120);return}
    var html=serialize(tree);
    out.innerHTML=html;
    st.className='st ok';st.textContent='render 成功 · '+html.length+' 字符 · '+dt+'ms';
    dbg.textContent=html.slice(0,600)+'\\n…';
  }catch(e){st.className='st bad';st.textContent='render 抛错';dbg.textContent=String(e && e.stack || e)}
}
var CARD_A='<div id="vcp-root" style="background:#0D0D0D;color:#E6EDF3;padding:18px;border:1px solid rgba(0,255,255,.35);border-radius:4px;box-sizing:border-box"><div style="font-size:11px;letter-spacing:.2em;color:#00FFFF">// headless&nbsp;test&nbsp;A</div><div style="font-size:20px;color:#fff;margin:4px 0 8px">卡片 A · 内联样式</div><div>若这里是一张深底卡片，说明补丁产物的渲染链路可用。</div></div>';
var CARD_B='<div id="vcp-root" style="background:#0D0D0D;color:#E6EDF3;padding:18px;border-radius:4px;box-sizing:border-box"><style>#vcp-root{font-size:14px;line-height:1.6}#vcp-root .k{color:#00FF00;font-family:Consolas,monospace}</style><div class="k">// headless test B</div><div style="font-size:20px;color:#fff">卡片 B · 含 style 块</div><div>style 块被保留并作用域化为 #vcp-msg-N。</div></div>';
run('a',CARD_A);run('b',CARD_B);
</script></body></html>`
  fs.writeFileSync(OUT, html, 'utf8')
  console.log('✓ 已生成自证页: ' + OUT + '  (' + html.length + ' 字符)')
  try { fs.unlinkSync(work) } catch { }
}

main()
