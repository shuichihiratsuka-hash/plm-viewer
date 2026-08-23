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

## 段階

| | 何ができるか | 要るもの |
|---|---|---|
| **第1歩（いま）** | **ファイルを選んで**表示する。実物が描けるか・何秒かかるかを測る | なし |
| 第2歩 | `#id=<DriveのファイルID>` から**直接読む** | Google OAuth クライアントID |

⚠️ 第1歩では **Drive のリンクは使えません**（上の CORS の話）。
`#id=` を付けた場合は「まだ読めません」と画面に出します（黙って白くしません）。

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
