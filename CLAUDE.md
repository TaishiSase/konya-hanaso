# 今夜話そ

## アプリ概要
佐瀬夫婦の話し合いノートWebアプリ。「今夜話したいこと」を議題として登録し、話し合いのログを残す。パパ・ママそれぞれが議題を追加し、いつ話すかを設定できる。

- ホスティング: Vercel（GitHubプッシュで自動デプロイ）

## 技術スタック
- フロントエンド: HTML + CSS + Vanilla JS（フレームワークなし）
- DB: Supabase（PostgreSQL）
- ホスティング: Vercel
- 認証: Supabase Auth

## ファイル構成
```
public/
  index.html        ← HTML
  script.js         ← 全ロジック
  styles.css        ← 全スタイル
  config.json       ← Supabase接続情報（supabaseUrl, supabaseKey, papaEmail, mamaEmail）
  config.example.json ← 設定テンプレート（パスワードのヒントあり）
package.json
```

## 主要機能
1. **ログイン**: パパ/ママを選択してSupabase Authでログイン
2. **議題一覧**: 未解決・解決済みの議題を表示
3. **議題追加**: タイトル・詳細・いつ話すかを設定
4. **議題編集**: タイトル・詳細・話す日時を変更
5. **話し合いログ**: 議題ごとにコメント・結論を記録
6. **解決済みマーク**: 話し合いが終わった議題を解決済みに

## 認証
- Supabase Authのメール＋パスワードでログイン
- パパ: `taish.dengel@gmail.com` / ママ: `vv8.shk.4ill@hotmail.co.jp`
- ログインしないとデータにアクセス不可

## 開発規約
- JSはVanilla JS、フレームワーク不使用
- `currentUser` 変数で現在のユーザー（'papa'/'mama'）を管理
