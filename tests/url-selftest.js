/* `#url=` で読む道の自己テスト（ブラウザも Google も要らない）
   ── なぜ vm で切り出すか ────────────────────────────────────
   このページは three.js を **CDN の importmap** から読むので、
   外へ出られない所（クラウドのセッション・社内の閉じた環境）では
   `<script type="module">` が**丸ごと動かない**。
   ⇒ 本物のブラウザでは `#url=` の検査ができない。
   ★なので plm-gas と同じ手（`tests/*-selftest.js`）で、
     **足した関数だけ**を index.html から切り出して回す。
   ⚠️ 描く所（`draw`）は「選ぶ」「Drive」と共通なので、ここでは呼ばれたことだけ見る。

   🔴 結果は「NG の行」ではなく**終了コード**で見る（例外で落ちると行が出ない）。
       node tests/url-selftest.js && echo OK
   ────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** `function 名(` / `async function 名(` を波括弧の対応で切り出す */
function grab(name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'g');
  const m = re.exec(SRC);
  if (!m) throw new Error('見つかりません: ' + name);
  let i = SRC.indexOf('{', m.index), d = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (!d) return SRC.slice(m.index, j + 1); }
  }
  throw new Error('閉じていません: ' + name);
}

let ng = 0;
const say = (ok, m) => { if (!ok) ng++; console.log((ok ? 'OK  ' : '🔴 NG ') + m); };

/** 1回ぶんの舞台を作る。★毎回作り直す（前の回の状態を持ち越さない）*/
function stage(opt) {
  opt = opt || {};
  const out = [];          /* log / phSay に出た文字 */
  const drew = [];         /* draw に渡ったもの */
  const fetched = [];      /* fetch した URL とメソッド */
  const ph = { style: {}, innerHTML: '' };
  const pick = { disabled: false, classList: { remove() {} } };
  const ctx = {
    console,
    performance,
    URL,
    busy: false,
    lines: [],
    shotName: '',
    location: { href: 'http://nas.local/viewer/index.html', origin: 'http://nas.local' },
    document: { getElementById: (id) => (id === 'ph' ? ph : pick) },
    log: (s, c) => out.push((c ? '[' + c + ']' : '') + s),
    phSay: (h) => out.push('[ph]' + h),
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    mb: (n) => (n / 1048576).toFixed(1) + ' MB',
    sec: (ms) => (ms / 1000).toFixed(1) + ' 秒',
    sizeGate: opt.sizeGate || (() => true),
    draw: async (buf, kind, t0) => { drew.push({ len: buf.length, kind }); },
    fetch: async (u, o) => {
      fetched.push({ u: String(u), method: (o && o.method) || 'GET' });
      const r = opt.fetch ? opt.fetch(String(u), (o && o.method) || 'GET') : { ok: true, body: 'x' };
      if (r.throw) throw new TypeError('Failed to fetch');
      return {
        ok: r.ok !== false, status: r.status || (r.ok === false ? 500 : 200),
        headers: { get: (k) => (k.toLowerCase() === 'content-length' ? (r.size || '') : '') },
        arrayBuffer: async () => new Uint8Array(r.size || 4).buffer,
      };
    },
  };
  vm.createContext(ctx);
  vm.runInContext([grab('kindOf'), grab('urlSafe'), grab('urlName'),
    grab('urlOut'), grab('openUrl')].join('\n'), ctx);
  return { ctx, out, drew, fetched, ph, pick, txt: () => out.join('\n') };
}

/* ══ ① 通していい URL だけ通す ═══════════════════════════════ */
{
  const s = stage();
  const ok = (u) => vm.runInContext('urlSafe(' + JSON.stringify(u) + ')', s.ctx);
  say(ok('/api/file/abc') === 'http://nas.local/api/file/abc', '① 相対パスは同じ置き場に解ける');
  say(ok('https://ex.com/a.stp') === 'https://ex.com/a.stp', '① https は通す');
  say(ok('http://nas.local/a.stp') === 'http://nas.local/a.stp', '① http も通す（NAS がこれ）');
  say(ok('javascript:alert(1)') === '', '① javascript: は通さない');
  say(ok('data:text/html,x') === '', '① data: は通さない');
  say(ok('file:///etc/passwd') === '', '① file: は通さない');
  say(ok('  ') === '' && ok('') === '', '① 空は通さない');
}

/* ══ ② 名前の取り方 ═════════════════════════════════════════ */
{
  const s = stage();
  const nm = (u) => vm.runInContext('urlName(' + JSON.stringify(u) + ')', s.ctx);
  say(nm('/f/%E9%83%A8%E5%93%81A.stp') === '部品A.stp', '② URL エンコードを戻す');
  say(nm('/api/file/123?x=1') === '123', '② 問い合わせは名前に混ぜない');
  say(nm('/api/file/') === 'file', '② 末尾の / は捨てる');
}

/* ══ ③ 読める形なら描くところまで届く ═══════════════════════ */
(async () => {
  {
    const s = stage({ fetch: () => ({ ok: true, size: 62 }) });
    await vm.runInContext('openUrl("/dummy.stp")', s.ctx);
    say(/URL から読みます/.test(s.txt()), '③ openUrl に入る');
    say(s.fetched[0] && s.fetched[0].method === 'HEAD', '③ 落とす前に HEAD で大きさを見る');
    say(s.fetched[1] && s.fetched[1].method === 'GET', '③ そのあと本体を落とす');
    say(s.drew.length === 1 && s.drew[0].kind === 'step', '③ draw まで届く（実装を増やさない）');
    say(s.ctx.shotName === 'dummy.stp', '③ 読んだ名前を覚える');
    say(s.ctx.busy === false && s.pick.disabled === false, '③ 終わったら握りを戻す');
  }
  /* ══ ④ 読めない形は**落とす前に**断る ═════════════════════ */
  {
    const s = stage();
    await vm.runInContext('openUrl("/note.txt")', s.ctx);
    say(/この形式は回せません/.test(s.txt()), '④ 読めない形はそう言う');
    say(!/name=/.test(s.txt()), '④ 拡張子は在るので name= の話はしない');
    say(s.fetched.length === 0, '④ 1バイトも落とさない');
    say(s.drew.length === 0, '④ 描かない');
  }
  /* ══ ⑤ 名前を持たない道は `name=` を求める ════════════════ */
  {
    for (const u of ['/api/file/123', '/api/file/', '/dl?id=9']) {
      const s = stage();
      await vm.runInContext('openUrl(' + JSON.stringify(u) + ')', s.ctx);
      say(/拡張子が読み取れませんでした/.test(s.txt()) && /name=/.test(s.txt()),
        '⑤ 拡張子が無い道（' + u + '）は name= を求める');
      say(s.fetched.length === 0, '⑤ ' + u + ' では1バイトも落とさない');
    }
    const s2 = stage({ fetch: () => ({ ok: true, size: 9 }) });
    await vm.runInContext('openUrl("/api/file/123", "部品A.stp")', s2.ctx);
    say(s2.drew.length === 1, '⑤ name= を渡せば読める');
    say(s2.ctx.shotName === '部品A.stp', '⑤ name= の名前を覚える');
  }
  /* ══ ⑥ 通さないスキーム ═══════════════════════════════════ */
  {
    const s = stage();
    await vm.runInContext('openUrl("javascript:alert(1)")', s.ctx);
    say(/この URL は読めません/.test(s.txt()), '⑥ 通さない URL は黙らずに断る');
    say(s.fetched.length === 0 && s.ctx.busy === false, '⑥ 握りも取らない');
  }
  /* ══ ⑦ 失敗の言い分けを分ける ═════════════════════════════ */
  {
    const t = async (status, re, label) => {
      const s = stage({ fetch: (u, m) => (m === 'HEAD' ? { ok: true, size: 9 } : { ok: false, status }) });
      await vm.runInContext('openUrl("/a.stp")', s.ctx);
      say(re.test(s.txt()), label);
      say(s.drew.length === 0, '⑦ ' + status + ' では描かない');
    };
    await t(403, /権限がありません/, '⑦ 403 は権限の話として言う');
    await t(404, /見つかりません/, '⑦ 404 は「無い」として言う');
    await t(500, /ダウンロードできませんでした/, '⑦ それ以外はそのまま言う');
  }
  /* ══ ⑧ HEAD を通さない置き場でも止めない ═════════════════ */
  {
    const s = stage({ fetch: (u, m) => (m === 'HEAD' ? { throw: true } : { ok: true, size: 9 }) });
    await vm.runInContext('openUrl("/a.stp")', s.ctx);
    say(s.drew.length === 1, '⑧ HEAD が通らなくても本体は読む');
    say(/サイズ不明/.test(s.txt()), '⑧ 分からないことは分からないと言う');
  }
  /* ══ ⑨ 大きすぎるものは落とす前に止める ═══════════════════ */
  {
    const s = stage({ sizeGate: () => false, fetch: () => ({ ok: true, size: 3e9 }) });
    await vm.runInContext('openUrl("/big.stp")', s.ctx);
    say(s.fetched.length === 1 && s.fetched[0].method === 'HEAD', '⑨ 大きすぎれば本体を落とさない');
    say(s.drew.length === 0, '⑨ 描かない');
  }
  /* ══ ⑩ 別の置き場で CORS が無いとき ═══════════════════════ */
  {
    const s = stage({ fetch: () => ({ throw: true }) });
    await vm.runInContext('openUrl("https://ex.com/a.stp")', s.ctx);
    say(/CORS/.test(s.txt()), '⑩ 別の置き場なら CORS だと言う');
    const s2 = stage({ fetch: (u, m) => (m === 'HEAD' ? { ok: true, size: 9 } : { throw: true }) });
    await vm.runInContext('openUrl("/a.stp")', s2.ctx);
    say(!/CORS/.test(s2.txt()), '⑩ 同じ置き場では CORS の話をしない');
  }
  /* ══ ⑪ 二重に走らせない ═══════════════════════════════════ */
  {
    const s = stage({ fetch: () => ({ ok: true, size: 9 }) });
    s.ctx.busy = true;
    await vm.runInContext('openUrl("/a.stp")', s.ctx);
    say(s.fetched.length === 0 && s.out.length === 0, '⑪ 処理中は何もしない');
  }

  /* ══ ⑫ 入口（ハッシュの読みと分岐）が在るか ═══════════════ */
  {
    say(/let hashUrl\s*=\s*decodeURIComponent/.test(SRC), '⑫ #url= を読んでいる');
    say(/let hashName\s*=\s*decodeURIComponent/.test(SRC), '⑫ name= を読んでいる');
    say(/if \(hashUrl && hashId\)/.test(SRC), '⑫ 両方来たときの決めごとが在る');
    /* 🔴 **Google の設定が無くても動く**＝分岐が `if (CFG.CLIENT_ID)` の外に在ること。
       ⚠️ 字面で「外」を確かめるため、`CFG.CLIENT_ID` の塊の**閉じ位置**と比べる。 */
    const iCfg = SRC.indexOf('if (CFG.CLIENT_ID) {');
    const iUrl = SRC.indexOf('} else if (hashUrl) {');
    say(iCfg > 0 && iUrl > 0, '⑫ 分岐が在る');
    /* `if (CFG.CLIENT_ID) {` の対応する `}` を探す */
    let d = 0, end = -1;
    for (let j = SRC.indexOf('{', iCfg); j < SRC.length; j++) {
      if (SRC[j] === '{') d++;
      else if (SRC[j] === '}') { d--; if (!d) { end = j; break; } }
    }
    say(end > 0 && iUrl > end, '⑫ 🔴 #url= の分岐は if (CFG.CLIENT_ID) の外に在る');
    /* ⚠️ ふだんの道を変えていないこと（`hashchange` は素通りのまま）*/
    say(/if \(!nEx && !exMode\) return;/.test(SRC), '⑫ hashchange の素通りを残している');
  }

  /* ══ ⑬ 戻り先（REDIRECT_URI）が「いま開いている置き場」に合うか ══
     🔴 設定は GitHub Pages 固定だったので、NAS に同じファイルを置いて開くと
        許可の往復から**GitHub Pages へ戻って**しまい、元のページに帰れなかった。 */
  {
    const src = SRC.slice(SRC.indexOf('const REDIR = (function(){'));
    const body = src.slice(0, src.indexOf('})();') + 5);
    const run = (cfg, origin, pathname) => {
      const location = { origin, pathname };
      const URLc = global.URL;
      const CFG = { REDIRECT_URI: cfg };
      return eval('(function(CFG, location, URL){ ' +
        body.replace('const REDIR =', 'return') + ' })')(CFG, location, URLc);
    };
    const GH = 'https://shuichihiratsuka-hash.github.io/plm-viewer/';
    say(run(GH, 'https://shuichihiratsuka-hash.github.io', '/plm-viewer/') === GH,
      '⑬ 同じ置き場なら設定の文字列をそのまま使う（末尾の / まで）');
    say(run(GH, 'https://nas.tail1a2b3c.ts.net', '/viewer/index.html')
        === 'https://nas.tail1a2b3c.ts.net/viewer/index.html',
      '⑬ 🔴 別の置き場なら、そのページ自身へ戻す');
    say(run('', 'https://nas.tail1a2b3c.ts.net', '/viewer/index.html') === '',
      '⑬ 設定が空なら空のまま（ポップアップ方式に落ちる）');
    say(run(GH, 'https://nas.tail1a2b3c.ts.net', '/viewer/')
        === 'https://nas.tail1a2b3c.ts.net/viewer/',
      '⑬ /viewer/ と /viewer/index.html を混ぜない（別物として扱う）');
  }

  console.log(ng ? '\n🔴 NG ' + ng + ' 件' : '\n✅ 全部通った');
  process.exit(ng ? 1 : 0);
})();
