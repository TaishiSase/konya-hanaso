# 🌙 こんや話そ

夫婦ふたりの「話し合いノート」アプリです。いつか話したいことをメモしておき、話し合いが終わったら解決済みにして記録を残せます。

**URL:** https://konya-hanaso.vercel.app/

---

## 機能

### 認証
- ユーザー（パパ / ママ）を選択してパスワードでログイン
- セッション中はログイン状態を維持

### 話したいことの管理
- **追加**：タイトル・カテゴリ・優先度を設定して話し合いたいことをメモ
- **一覧**：未解決のトピックを優先度順（🔥急ぎ → 普通）に表示
- **解決**：話し合いが終わったら決めたことをメモして解決済みへ移動
- **削除**：不要になったトピックを削除
- **履歴**：解決済みの話し合い一覧を確認

### カテゴリ
| カテゴリ | 内容 |
|---|---|
| 💰 お金 | 家計・貯蓄・保険など |
| 👶 育児・子ども | 子育て・教育・保育園など |
| 🏠 家のこと | 住まい・家事・引越しなど |
| 💑 二人のこと | 旅行・記念日・将来の話など |
| 💼 仕事のこと | キャリア・転職・残業など |

### 優先度
- **普通**：時間があるときに話し合いたい
- **🔥 急ぎ**：なるべく早く話し合いたい（一覧の上部に表示）

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JavaScript |
| バックエンド (DB) | [Supabase](https://supabase.com/)（PostgreSQL） |
| ホスティング | [Vercel](https://vercel.com/) |
| フォント | Noto Sans JP / Zen Maru Gothic（Google Fonts） |

---

## ファイル構成

```
konya-hanaso/
├── public/
│   ├── index.html             # アプリ本体
│   ├── styles.css             # スタイル
│   ├── script.js              # アプリロジック
│   ├── config.json            # Supabase接続情報（gitignore推奨）
│   └── config.example.json   # 接続情報のサンプル
└── vercel.json                # Vercelデプロイ設定
```

---

## Supabase接続

`public/config.json` に Supabase の接続情報を記述します：

```json
{
  "supabaseUrl": "https://xxxx.supabase.co",
  "supabaseKey": "your-anon-key",
  "passwords": {
    "papa": "your-papa-password",
    "mama": "your-mama-password"
  }
}
```

### テーブル構成

#### `topics` テーブル

| カラム | 型 | 説明 |
|---|---|---|
| `id` | uuid | 主キー |
| `title` | text | 話し合いたい内容 |
| `category` | text | `money` / `childcare` / `home` / `couple` / `work` |
| `priority` | text | `normal` / `urgent` |
| `is_resolved` | boolean | 解決済みフラグ |
| `resolution_memo` | text | 話し合いで決めたこと |
| `created_by` | text | `papa` / `mama` |
| `created_at` | timestamp | 作成日時 |
| `resolved_at` | timestamp | 解決日時 |

---

## デプロイ

GitHub の `main` ブランチにプッシュすると Vercel が自動デプロイします。
