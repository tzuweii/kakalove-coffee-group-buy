# Kakalove Cafe 咖啡團購共編工具

## 專案概覽

單一 HTML 檔案的咖啡團購工具，供主揪（管理員）與參與者共同下單使用。
資料即時同步至 Firebase Firestore，部署在 Cloudflare Pages。

- **正式網址**：https://cold-disk-bf47.tzuweichengkor.workers.dev
- **本機開發**：`python3 -m http.server 8080`，開啟 http://localhost:8080
- **唯一原始檔**：`index.html`（所有 HTML / CSS / JS 在同一檔案）

## 技術架構

| 層級 | 技術 | 說明 |
|---|---|---|
| 前端 | 純 HTML + CSS + JS | 無框架，無建置流程 |
| 資料庫 | Firebase Firestore（免費 Spark 方案） | 即時同步 |
| 圖片 | base64 存入 Firestore | 上限 700KB／張，不用 Firebase Storage |
| 託管 | Cloudflare Pages | 靜態托管，直接上傳 index.html |
| CORS Proxy | Cloudflare Worker `kakalove-proxy.tzuweichengkor.workers.dev` | 供品項同步使用（爬 HTML，見下方說明） |

## Firebase 設定

- **專案 ID**：`kakalove-groupbuy`
- **Firebase Config**：已寫入 index.html 的 `FIREBASE_CONFIG` 常數

### Firestore 集合結構

```
meta/state           → { round: number }            當前輪次
orders/{name}        → { name, items, total, time }  當輪每人訂單（一人一文件）
history/{round}      → { round, date, note, orders, grandTotal, shoppingCredit, receipt }
products/{id}        → 品項資料（首次載入自動從 DEFAULT_PRODUCTS 植入）
```

### Firestore 安全規則

目前設為測試模式（allow read, write: if true），適合私人群組使用。

## 主要功能

1. **下單**：選咖啡品項加入購物車，填名字送出，即時出現在其他人畫面
2. **本輪彙整**：顯示所有人訂單，可複製文字清單，結單移至歷史
3. **歷史紀錄**：過去每輪記錄，可上傳收據（base64，限 700KB），設定購物金折抵
4. **管理員**：新增 / 編輯 / 刪除咖啡品項，品項同步至 Firestore 即時更新所有裝置
5. **品項同步**：從 Kakalove 官網自動抓取新品，一鍵寫入 Firestore（見下方說明）

## 購物金功能

- 收據 modal 輸入本次購物金金額
- 系統自動等分給有參與該輪的所有人（`Math.round(credit / n)`）
- 歷史頁顯示原始金額（刪除線）與折抵後應付金額（綠色）

## State 架構

```javascript
// 本地狀態（由 Firestore onSnapshot 即時同步）
let state = { round: 1, orders: [], history: [] };

// Firestore listeners（在 index.html script 最上方）
db.doc('meta/state').onSnapshot(...)       // 輪次
db.collection('orders').onSnapshot(...)    // 當輪訂單
db.collection('history').orderBy('date','desc').onSnapshot(...)
db.collection('products').onSnapshot(...)  // 品項（含自動植入邏輯）
```

`save()` 為 no-op，所有寫入直接呼叫 Firestore。

## 品項資料

- `DEFAULT_PRODUCTS`：hardcode 的預設品項陣列（25 個，含非洲 / 北中南美洲 / 亞洲 / 配方豆）
- `let PRODUCTS = []`：從 Firestore 讀取，首次空集合時自動植入 DEFAULT_PRODUCTS
- 分類名稱（`cat` 欄位）：`非洲` / `北/中/南美洲` / `亞洲` / `配方豆`（v1.0.0 修正，原為 `美洲` / `亞太`）

## 品項同步功能

### 背景與決策過程

Kakalove **不是 Shopify，而是 Shopline**（圖片網域為 `shoplineimg.com`）。
這個發現在嘗試抓 Shopify 格式的 `/products.json`、Atom feed 等所有路徑均失敗後才確認。

嘗試過的路徑（全部失敗）：

| 方案 | 做法 | 失敗原因 |
|---|---|---|
| 方案一 | Worker 直接抓 `/products.json` | Kakalove 封鎖，回傳網頁而非 JSON |
| 方案二 | Worker 加 Browser User-Agent header | 同上，仍被封鎖 |
| 方案三 | 改抓 Atom RSS feed（`/collections/all.atom`）| 同上，Shopline 非 Shopify，路徑不存在 |
| 方案四 | 手動貼上 JSON（使用者複製貼上）| `/products.json` 對使用者瀏覽器也顯示網頁 |
| 方案五 | 不同 collection 路徑（`/collections/all/products.json`）| 同上 |
| 方案六 | 抓頁面內嵌 `<script type="application/json">` | 被封鎖 |

**最終解法（方案七）**：爬 Kakalove 分類頁 HTML，用 regex 解析 Shopline 的產品卡結構。

### Shopline 產品卡 HTML 結構

```html
<a class="Product-item ng-isolate-scope multi-image" href="/products/{handle}">
  <div class="info-box">
    <div class="info-box-inner-wrapper">
      <div class="title text-primary-color force-text-align-">品名</div>
      <div class="quick-cart-price force-text-align-">
        <!-- NT$340 -->
        <div class="price__regular">
          <span class="... sl-price ...">NT$340</span>
        </div>
      </div>
    </div>
  </div>
</a>
```

- 品名：`<div class="title ...">` 內文
- 價格：`<!-- NT$340 -->` 註解（優先）或 `<span class="... sl-price ...">` 內文
- handle / URL：`<a class="Product-item ...">` 的 `href` 屬性

### 同步來源（四個產區分類頁）

```
/categories/550002c8e36c8e3e250000c3  → cat: '非洲'
/categories/5508003ae37ec6a3a800013e  → cat: '北/中/南美洲'
/categories/5500031e2ed0f2264000001f  → cat: '亞洲'
/categories/blend                     → cat: '配方豆'
```

原本嘗試 `/products`（全品項頁），但包含非咖啡豆商品，改為以上四個分類頁。
Worker 抓取時自動帶入 `cat` 欄位，確保同步後品項直接出現在正確分類。

### Cloudflare Worker（`kakalove-proxy`）

- 對四個分類頁依序抓取，每個分類自動處理分頁（`?page=N`，最多 20 頁）
- 跨分類重複品項以 `handle` 去重
- 回傳格式：`{ products: [{ handle, title, cat, url, variants:[{price}], tags:'', body_html:'' }] }`
- **注意**：`tags` 與 `body_html` 無法從列表頁取得，同步後需在管理員介面手動補齊

### index.html 同步 UI

管理員分頁的「從 Kakalove 同步」按鈕開啟 modal，提供兩個 tab：

- **自動同步**：呼叫 Worker，比對現有 `PRODUCTS`（以 URL handle 為 key），顯示新品 / 疑似下架品
  - 新品清單頂部有「⚡ 一鍵全部新增」按鈕，用 Firestore batch write 批次寫入（每批 400 筆）
  - 各品項也可點「編輯後新增」逐筆修改再存入
- **手動貼上 JSON**：備援路徑，使用者若能取得 JSON 可直接貼上解析，邏輯與自動同步相同

### guessEmoji 邏輯

新同步品項沒有人工填寫的 emoji，自動推斷規則：

1. **風味關鍵字優先**（19 個）：品名含「藍莓」→ 🫐、「巧克力」→ 🍫 等，語意明確
2. **品名 hash fallback**：無風味關鍵字時，對品名做 `hash = (hash * 31 + charCode) >>> 0`，對 30 個精選自然系 emoji 取模

> **設計決策**：不用產地或處理法當 emoji，因為同分類的品項會全部顯示相同 emoji（例如同一產區全排 🌍，或水洗處理法全排 💧），版面單調。hash 確保同品項穩定、不同品項多樣。


## 手機版 CSS 已知問題與修正紀錄

### CSS Grid item 水平溢出

**症狀**：手機版非配方豆分類的品項卡片右側被截斷，「第N輪」按鈕位置跑掉。配方豆正常是因為品名較短。

**診斷方式**：在 Console 執行以下指令，找出所有超出螢幕的元素：
```javascript
[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).map(el => el.className || el.tagName).slice(0, 20)
```

結果顯示從最外層無 class 的 `DIV`（寬 519）到 `product-item` 全部超出，視窗寬僅 390。

**根本原因**：CSS Grid item 預設 `min-width: auto`，當內容（長品名）比欄寬大時，item 不會收縮反而被撐破，連帶把整個 grid 撐寬。`overflow-x: hidden` 只隱藏捲軸，DOM 寬度仍然超出。

**修正**（加在手機 media query 內）：
```css
html { max-width: 100vw; overflow-x: hidden; }
body { max-width: 100vw; overflow-x: hidden; width: 100%; }
* { box-sizing: border-box; }
.order-grid > * { min-width: 0; max-width: 100%; overflow: hidden; }
```

> **重要**：對品名（`.pi-name`）或卡片（`.card`）本身加 `word-break` / `overflow:hidden` 無效，必須從 grid item 層（`.order-grid > *`）加 `min-width:0` 才能解決。

## 部署流程

### index.html

1. 修改 `index.html`
2. Cloudflare Dashboard → Workers & Pages → `cold-disk-bf47` → Deployments → 重新上傳 `index.html`

### Cloudflare Worker（品項同步 proxy）

1. 修改 Worker 程式碼
2. Cloudflare Dashboard → Workers & Pages → `kakalove-proxy` → Edit Code → 貼上 → Deploy

> **注意**：`cold-disk-bf47`（Pages）與 `kakalove-proxy`（Worker）是兩個完全獨立的服務。
> Pages 的 Bindings 欄顯示「No workers bound」是正常的，兩者透過公開 URL 溝通，不需要 binding。

## 版本紀錄

| 版本 | 檔案 | 日期 | 說明 |
|---|---|---|---|
| v1.0.2 | index_ios.html | 2026-06-26 | 手機版優化（見下方詳細） |
| v1.0.1 | index.html | 2026-06-26 | UI 更新（見下方詳細） |
| v1.0.0 | index.html | 2026-06-24 | First Release（見下方詳細） |

### v1.0.2 — 2026-06-26 · 手機版優化（index_ios.html）

- 新增 `index_ios.html`：以 `index.html` v1.0.1 為基礎的手機專用版本
- 購物車浮動列（Cart Bar）：選品後從畫面底部滑出，顯示品項數量與總金額
- 購物車抽屜（Drawer）：點擊 Cart Bar 從底部展開，含名字輸入、品項明細、送出按鈕
- 購物車名字雙向同步：桌機欄位 ↔ 抽屜欄位互相同步（`syncBuyerName`）
- Modal 改為 bottom sheet（底部滑出）；開頁警告視窗保持畫面置中
- 分頁列（tabs）縮小字體、支援水平捲動，防止小螢幕溢出
- 修正手機水平溢出（`html,body { overflow-x:hidden }`）與 Header 白邊問題
- `viewport-fit=cover` 支援 iPhone 瀏海 / Dynamic Island 的 safe area
- 輸入框字體強制 16px，防止 iOS Safari 自動縮放
- 管理員品項編輯 Modal 改為單欄，適合手機操作

### v1.0.1 — 2026-06-26 · UI 更新

- 移除下單頁版本紀錄可收合卡片
- 新增開頁警告彈出視窗（需點擊確認才能關閉，點背景不會消失）
- 新增左側版本紀錄跑馬燈：固定在瀏覽器視窗與卡片之間的留白，視窗寬度 ≥ 1270px 才顯示；版本號固定頂部，條目整體由下往上捲動後淡出，循環播放所有版本；四個分頁均顯示，切換分頁不重啟動畫
- `CHANGELOG` 常數集中管理版本紀錄資料，供跑馬燈使用

### v1.0.0 — 2026-06-24 · First Release

- 下單 / 本輪彙整 / 歷史紀錄 / 管理員四分頁
- Firebase Firestore 即時同步
- 自動同步品項（爬 Kakalove 分類頁 HTML）＋ 一鍵新增
- 手動貼上 JSON 備援同步
- 分類修正：`美洲` → `北/中/南美洲`、`亞太` → `亞洲`
- `guessEmoji`：風味關鍵字優先，無關鍵字時以品名 hash 確保多樣性
- 購物金等分折抵、收據圖片上傳（base64，上限 700KB）
- Header 版本徽章、tabs 下方免責聲明橫幅

## 已知限制

- 收據圖片超過 700KB 會被擋，需先壓縮
- 同步後的品項 `tags`、`body_html`、`flavors`、`desc` 均為空，需手動在管理員介面補齊
- 管理員分頁無身份驗證，任何拿到網址的人都能編輯品項
- Firestore 安全規則為測試模式（allow read, write: if true），適合私人群組，不適合公開使用
- 已手動一鍵新增的品項若 `cat` 填錯，需手動修正（不會自動重新同步覆蓋）
