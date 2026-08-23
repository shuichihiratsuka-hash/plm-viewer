# plm-viewer

`plm-gas`（社内の PLM）から開く **3D / 図面のビューア**。GitHub Pages で配信します。

**→ https://shuichihiratsuka-hash.github.io/plm-viewer/**

## なぜ plm-gas の外に置くのか

`plm-gas` は Apps Script のウェブアプリで、画面が `googleusercontent.com` の
iframe の中で動きます。そのため：

- `drive.google.com` への `<img>` / `fetch` は**別サイトへの要求**になり、
  ブラウザが Drive の Cookie を送らないので**非公開ファイルは 403** になる
  （2026-08-22 に iOS Safari で実測）
- 回避のためサーバ（GAS）で中継すると、`google.script.run` の
  **ペイロード上限**に当たる。⚠️ 実データは**治具1点で 10.5MB**、組立はさらに大きい

**Drive API は CORS に対応している**ので、ページから直接 `files.get?alt=media` を
叩ければ中継が要らず、上限も消えます。それには plm-gas とは別の
**普通のオリジン**が必要で、その置き場がここです。

## できること（★2026-08-23 に両方とも実測できた）

| 入口 | どう使うか | 実測（iPhone・`めっき治具_L0.stp` **10.5MB**）|
|---|---|---|
| **ファイルを選ぶ** | 端末のファイルを選んで描く | WASM 0.3秒 ＋ 変換 5.4秒 ＝ **5.7秒**（三角形 140,046 / 頂点 113,558）|
| **`#id=<DriveのファイルID>`** | Drive から**直接読んで**描く | ダウンロード 1.4秒 ＋ 変換 5.6秒 ＝ **7.1秒** |

`plm-gas` からは後者で開きます（`coreOpen3d` が `#id=` を付けた URL を別窓で開く）。
初回だけ Google の許可を1回聞かれます（`drive.readonly`）。

⚠️ **組立はまだ測っていません。** 上は治具1点の数字で、大きさが1桁違うと
別の壁に当たり得ます（測ったらここに追記してください）。

⚠️ 読めるのは **STEP / IGES** だけです（`.stp` `.step` `.igs` `.iges`）。
**glTF / GLB は読みません。**

## 使うもの

| | ライセンス | 読み込み方 |
|---|---|---|
| [occt-import-js](https://github.com/kovacsv/occt-import-js) 0.0.23（STEP / IGES を読む） | **LGPL-2.1** | jsDelivr から**改変せず** |
| [OpenCASCADE](https://www.opencascade.com)（上記が内包） | **LGPL-2.1** | 同上 |
| [three.js](https://threejs.org) 0.185.1（描画） | MIT | 同上 |

ライセンス全文は [`licenses/`](licenses/) にあります。
⚠️ **GitHub Pages は公開＝配布**にあたるため、表示義務としてここに置いています。
改変して使う場合は LGPL の条件を確認してください。

## セキュリティの境界

- ページは**誰でも開けます**が、**図面データはページに含まれません**
- 読めるのは「開いた人が **Drive でそのファイルを開ける権限**を持つもの」だけ。
  ⇒ 境界は Google 側に残ります
- ⚠️ ただし**ファイルIDは URL に乗ります**（`#` の後ろなのでサーバには送られませんが、
  リンクを渡せばその人の権限で開けます）

## OAuth の設定（★一度きり。作り直すときの手順）

`config.js` の `CLIENT_ID` に入れる値を作る手順です。
**クライアント シークレットは使いません**（ブラウザだけの OAuth なので不要。
クライアント ID は公開してよい値で、実際にこのリポジトリに入っています）。

| 手順 | どこで |
|---|---|
| ① Google Cloud のプロジェクトを開く（会社のアカウントで）| https://console.cloud.google.com |
| ② **Google Drive API** を有効にする | API とサービス → ライブラリ |
| ③ **Google Auth Platform**（旧「OAuth 同意画面」）で**対象**を **内部** にする | https://console.cloud.google.com/auth/audience |
| ④ **スコープ**に `.../auth/drive.readonly` を足す | https://console.cloud.google.com/auth/scopes |
| ⑤ **クライアント**を作る（種類＝**ウェブ アプリケーション**）| https://console.cloud.google.com/auth/clients |
| ⑥ **承認済みの JavaScript 生成元**に `https://shuichihiratsuka-hash.github.io` を入れる | 同じ画面 |
| ⑦ 出てきた**クライアント ID** を `config.js` に貼る | このリポジトリ |

- ⚠️ **内部（Internal）**にすると Google の審査が要りません（社内の人だけが使えます）
- ⚠️ **リダイレクト URI は要りません**（トークンクライアント方式なので使いません）
- ⚠️ 生成元は**オリジンまで**（`https://…github.io`）。**パスを付けると弾かれます**
- ⚠️ 新しいコンソールでは「OAuth 同意画面」という名前が**「Google Auth Platform」**、
  「内部 / 外部」が**「対象」**に変わっています（見出しを探すときの手掛かり）

## 踏んだこと

### 🔴 `<input type="file">` に `accept` を付けない

`accept=".stp,.step,…"` を付けていたら、iPhone の**ファイル選択で全部グレーアウトして
選べなかった**（2026-08-23 に実機で発生。OneDrive に落とした `.stp` が選べない）。

iOS は `accept` を **UTI（ファイル種別の識別子）の一覧に翻訳**するが、
`.stp` / `.step` には登録された UTI が無く、`application/step` も認識されない。
結果として**許可リストが空同然になる**。

→ **`accept` を付けず、種別の判定は JS（`kindOf`）でやる。**
⚠️ 読めない拡張子を渡されたら**そう言う**（変換に投げて意味不明な失敗にしない）。
