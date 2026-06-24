# オンラインクリニック

スマホで相談できるオンライン診療サービス向けの静的ホームページです。

## ローカル確認

```powershell
node serve.js
```

ブラウザで `http://127.0.0.1:4174` を開いて確認できます。

## GitHub Pages

`index.html`、各階層の `index.html`、`styles.css`、`script.js`、`config.js`、`assets/` をそのまま公開できます。

## SEO公開準備

- `sitemap.xml` と `robots.txt` を追加済みです。
- 各ページに `canonical`、OGP、Twitterカード、構造化データを設定済みです。
- 現在の正式URLは一時的に `https://yasu369.github.io/onn-kuri/` としています。
- 独自ドメイン取得後は、HTML内の `canonical`、OGP URL、構造化データURL、`sitemap.xml`、`robots.txt` のURLを新ドメインへ差し替えてください。

## セキュリティ方針

- `config.js` はブラウザで誰でも確認できる前提です。SendGrid、AWS、決済サービスなどの秘密鍵・APIトークン・パスワードは絶対に入れないでください。
- `config.js` に置くのは、LINE公式アカウントURL、note RSS URL、問い合わせ先メールアドレスなど、公開されても実害のない値だけです。
- `config.js` の設定値は `Object.freeze` で固定し、ページ読み込み後に意図せず書き換わりにくい形にしています。
- GitHub Pagesのサブディレクトリ公開に対応するため、サイト内リンク・画像・CSS・JSは先頭スラッシュを使わず、相対パスで記述します。

## GitHubに公開する前のメール保護

GitHubの `Settings` → `Emails` で `Keep my email addresses private` を有効にしてください。その後、GitのメールアドレスをGitHubが発行する非公開用メールに設定します。

```powershell
git config user.email "ユーザーID+ユーザー名@users.noreply.github.com"
```

既に本物のメールアドレスでコミットした履歴がある場合は、公開前に履歴修正が必要です。

## ページ構成

- `/` トップページ
- `/pricing/` 料金一覧
- `/flow/` ご利用の流れ
- `/diet/` ダイエット・サポート
- `/stomach/` 整腸・胃薬
- `/pill/` 低容量ピル
- `/ed/` ED薬
- `/aga/` AGA
- `/beauty/` 保湿剤・美容薬
- `/contact/` お問い合わせ
- `/limited-info/` 限定情報
- `/privacy/` プライバシーポリシー
- `/profile/` 特定商取引法に基づく表記
- `/terms/` 利用規約
