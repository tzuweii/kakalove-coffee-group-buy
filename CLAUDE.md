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
products/{id}        → 品項資料（doc id 為 Kakalove handle，由品項同步寫入）
```

### Firestore 安全規則

目前設為永久開放模式（`allow read, write: if true`，無到期日），適合私人群組使用。
（原為帶 30 天到期日的測試模式，到期後曾導致全站癱瘓，2026-07-29 改為無到期日，詳見「已知限制」。）

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
db.collection('products').onSnapshot(...)  // 品項
```

`save()` 為 no-op，所有寫入直接呼叫 Firestore。

## 品項資料

- `DEFAULT_PRODUCTS`：hardcode 的預設品項陣列（25 個，含非洲 / 北中南美洲 / 亞洲 / 配方豆）
- `let PRODUCTS = []`：從 Firestore 讀取。**空集合時不再自動植入 `DEFAULT_PRODUCTS`**
  （原邏輯已移除，見「已知限制」），畫面改為提示執行同步
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
- **注意**：`tags` 與 `body_html` 官網沒有對應欄位。`tags` 改由 index.html 的 `guessTags()`
  從品名推導（v1.0.5），`body_html` 仍為空

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
| v1.0.5 | index.html | 2026-09-02 | 一鍵刪除下架品、標籤自動推導、移除自動植入（見下方詳細） |
| v1.0.4 | index.html | 2026-08-19 | 磅數顯示修正、結單覆蓋 bug fix（見下方詳細） |
| v1.0.3 | index.html + Worker | 2026-07-04 | 品項同步 bug fix（見下方詳細） |
| v1.0.2 | index_ios.html | 2026-06-26 | 手機版優化（見下方詳細） |
| v1.0.1 | index.html | 2026-06-26 | UI 更新（見下方詳細） |
| v1.0.0 | index.html | 2026-06-24 | First Release（見下方詳細） |

### v1.0.5 — 2026-09-02 · 一鍵刪除下架品、標籤自動推導、移除自動植入

#### 同步「一鍵全部刪除」

原本下架品只能逐筆確認刪除（設計上刻意保守）。但咖啡是農產品、品項汰換快，
改為在「查無品項」區塊加上一鍵全部刪除，沿用新增路徑的 batch write（每批 400 筆）。
`_syncRemovedList` 記錄當次比對結果，逐筆與批次刪除共用 `refreshRemovedListUI()`。

#### `guessTags()` — 從品名推導標籤

官網列表頁與詳情頁都沒有可對映 `tags` 的欄位，改由品名解析。
push 順序即卡片標籤的顯示順序：**處理法 → 評鑑（CR9x / Espresso Review）→ 賽事得獎
→ 分級（G1 / AA TOP / SHB）→ 低因 → 品種 → 配方 / 掛耳 / 禮盒**。

- 處理法優先取品名中的細分寫法（`厭氧日曬`、`酵素水洗`、`蘭姆桶發酵`…），抓不到才退回 Worker 的 `process`
- 分級用「前後補空白」的整詞比對，避免 `AA` 誤中其他字串
- 瑰夏與藝伎統一標為「藝伎」
- **「低因」刻意排在品種之前** —— 卡片標籤有數量上限，對消費者而言低咖啡因比品種名重要

以線上 38 筆實測：38/38 都推得出標籤，平均 2.2 個。

#### 移除空集合自動植入 DEFAULT_PRODUCTS

> **這是一個地雷，不是初始化功能。**

`products` 集合早已由官網同步結果接管（doc id 為 handle），`DEFAULT_PRODUCTS` 的植入邏輯
平常不生效，但**只要目錄被刪到最後一筆，每個開著頁面的瀏覽器都會把 25 筆過期預設品寫回去**。
清空重建時會變成新舊混雜（實測會從 38 筆變成 63 筆並產生新的重複）。

已移除 `if(snap.empty){...}` 區塊，`DEFAULT_PRODUCTS` 常數保留作為原始品項的參考資料。
目錄為空時，下單頁改顯示「請至管理員分頁執行同步」。

#### `CURATED_EMOJI` — 人工 emoji 以 handle 記錄

`guessEmoji` 是品名 hash，語意上不一定貼切，人工挑過的 emoji 在清空重建後會遺失。
新增 `CURATED_EMOJI`（handle → emoji）記錄 7 個人工挑選的值，
查找順序為 **既有值 → CURATED_EMOJI → guessEmoji**，重建後可完整還原。

同時修正 `bulkAddFromSync` 的覆寫問題：`batch.set()` 是整份覆寫，
若同 id 品項已存在（例如 `url` 欄位異動導致沒被比對到），人工的 `emoji` / `tags` 會被推斷值蓋掉。
現在一律先查 `PRODUCTS` 沿用既有值，既有值為空才用推導結果填補。

#### 品名不再分中英文

Shopline 產品卡只有一個中文品名，同步時 `name_zh` / `name_en` 被填入同一個值，
卡片與詳情 modal 都把同一行字印兩次。移除 `name_en` 的所有顯示與寫入
（管理員表單、卡片、詳情 modal、搜尋、`productSize` 的 hay）。

> **設計決策**：欄位 key 保留 `name_zh` 不改名為 `name`。key 使用者看不到，
> 為此遷移 38 筆線上文件、改 19 處程式碼、還要承擔遷移空窗期品名空白的風險，換不到功能。
> 現有文件的 `name_en` 成為沒人讀的殘留欄位，不影響運作。

#### 卡片標籤列（取代原英文品名的位置）

```
烘焙度徽章
品名
[磅數] [處理法] [評鑑] [分級] [品種]    ← 米色標籤（新）
風味 chip                              ← 白底 chip
```

- **磅數排第一，且不存進 Firestore** —— 由既有的 `productSize()` 即時推導，
  品名一改就跟著對，不必重新同步
- 掛耳 / 禮盒不是秤重賣的，`productSize()` 會誤判為 0.5磅，這類品項不顯示磅數
- 上限 5 個（原為 4 個時會把低因豆的「低因」切掉，卻保留品種名）
- `pi-top` 原本的灰色處理法小字已移除，否則「水洗」會在同一張卡片出現兩次
- 無標籤時商品詳情的「標籤」區塊整塊隱藏，不再留一個有標題沒內容的空白區

目標是讓消費者只看標籤列與風味 chip 就能掌握份量、處理法、評鑑、分級、品種、是否低因與風味。

#### 目錄重建（一次性作業）

線上原有 44 筆文件其實只對應 37 個商品 —— 有 7 支咖啡同時存在「原始手工版（短 id）」與
「官網同步版（handle id）」兩份文件，下單頁各出現兩次；另有 9 筆已從官網下架。

以 `rebuild-products.js` 兩段式重建：先刪除 43 筆並**保留一筆錨點**（`hip-hop-blend-1`），
讓集合永不為空 —— 因為無法確保其他人的裝置都重新整理過，舊版頁面一遇到空集合就會植入
`DEFAULT_PRODUCTS`。同步新增後再刪掉錨點、二次同步補回。

結果：38 筆、doc id 統一為 handle、零重複、標籤全數就位、7 個人工 emoji 全部還原。
訂單與歷史不受影響（`submitOrder` 送出時已快照品名與單價）。

### v1.0.4 — 2026-08-19 · 磅數顯示修正、結單覆蓋 bug fix

#### 磅數顯示修正

`openDetail()` 原本將商品詳情的價格硬編為 `NT$xxx / 0.25磅`，所有品項都顯示 0.25 磅。

新增 `productSize(p)`：優先取 `p.size`，否則檢查品名 / `url` / `id` 是否含 `4oz` 或 `0.25磅`，
其餘回傳 `0.5磅`（對應官網小叮嚀：「咖啡豆以 0.5 磅袋包裝，高單價及數量少的咖啡豆以 0.25 磅袋裝」）。

以線上實際 44 筆品項驗證：10 筆判為 `0.25磅`、34 筆判為 `0.5磅`，與品名標示相符。

> **設計決策**：曾嘗試在 `DEFAULT_PRODUCTS` 逐筆補 `size` 欄位，但**完全無效**。
> 正式環境的 `products` 集合早已被官網同步結果整批取代（文件 ID 為 Kakalove handle，
> 非 `DEFAULT_PRODUCTS` 的短 id），而 `DEFAULT_PRODUCTS` 僅在集合為空時植入。
> 任何只改 `DEFAULT_PRODUCTS` 的修正都不會影響線上品項。

#### 結單覆蓋 bug fix（造成第一輪團購紀錄遺失）

`finalizeRound()` 原以 `history/{round}` 為文件 ID 呼叫 `.set()`，同輪次重複結單會**靜默覆蓋**既有紀錄。

實際災情：第一輪（2026-06-24，$2,110）結單後 `meta/state.round` 未正確遞增，
第二輪（2026-08-19，$2,570）沿用輪次 1 再次寫入 `history/1`，第一輪紀錄被覆蓋且無法復原。

修正：
- 改用 `.add()` 自動生成文件 ID，不再以輪次當 ID
- 寫入前先 `where('round','==',roundNum).limit(1)` 查重，已存在則中止並提示，不再靜默覆蓋
- 刪除 / 收據更新既有邏輯已使用 `rec._docId`（來自 `onSnapshot` 的 `d.id`），與自動 ID 相容

事後以 Console 腳本重建第一輪紀錄（依結單截圖，品項單價為估算值、每人總金額正確），
並修正 `history/1` 的 `round` 欄位為 2、`meta/state.round` 為 3。

### v1.0.3 — 2026-07-04 · 品項同步 bug fix

#### Worker（`kakalove-proxy`）

- **修正促銷頁面污染問題**：Shopline 將促銷商品資訊（`title_translations`）嵌入 `<script>` 標籤，其中含有 `主風味:`、`烘焙度:` 等欄位標籤，導致 Worker 將促銷商品標題誤判為咖啡豆的風味 / 烘焙度。
  - 初始嘗試：用 regex 移除 `<script>` 標籤，但失效原因是 Shopline 的大型 script 內容本身含有字面 `</script>` 字串，非貪婪 regex 會在第一個出現位置提前停止，無法完整刪除。
  - 最終解法（`parseDetailFromHtml`）：改為**只截取**商品描述區塊（`START SHOPLINE RICH CONTENT` → `ProductDetail-shipping-payment`），完全忽略頁面其餘所有內容（scripts、促銷區塊、送貨付款等）。此策略不依賴移除特定污染源，對頁面結構變動有最高容忍度。

#### index.html

- **修正「編輯後新增」烘焙度空值**：`openProductEditFromSync` 直接將 Worker 回傳的 `sp.roast`（例如 `"淺烘焙"`）設進 `<select>` value，但 select 選項只有 `"淺焙"`，Chrome 找不到對應 option 時靜默設為 `""`，存入 Firestore 即為空字串。修正方式：在設值前加 `normalizeRoast(sp.roast)`，與 `bulkAddFromSync` 路徑一致。
- **同步清單新增簡介（desc）顯示**：同步 modal 的品項卡片現在在風味 chips 下方顯示 `desc` 欄位，方便確認抓取內容是否正確再決定是否新增。

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
- 同步後的品項 `body_html` 為空。`flavors` / `desc` 自 v1.0.3 起可從詳情頁抓到，
  `tags` 自 v1.0.5 起由 `guessTags()` 從品名推導，均不需手動補齊
- 管理員分頁無身份驗證，任何拿到網址的人都能編輯品項
- Firestore 安全規則為永久開放模式（`allow read, write: if true`，無到期日），適合私人群組，不適合公開使用。
  - **歷史注意**：原本以測試模式建立，規則帶 30 天到期日，2026-07-26 到期後 Firestore 拒絕所有讀寫、全站癱瘓。2026-07-29 於 Firebase Console 改為 `if true`（不帶到期日）修復，日後不會再自動過期。
- 已手動一鍵新增的品項若 `cat` 填錯，需手動修正（不會自動重新同步覆蓋）
- 磅數由 `productSize()` 從品名 / URL 推斷，非官網欄位。若 Kakalove 改用其他袋裝規格
  （如 1 磅）或品名未標示 `0.25磅` / `4oz`，會誤判為 `0.5磅`
- **修改前務必先 `git fetch`**：本地曾長期落後遠端 11 個提交（v1.0.2 / v1.0.3 都在遠端），
  差點以舊版覆蓋。線上部署版與 `origin/main` 的 `index.html` 內容一致，
  必要時可 `curl https://cold-disk-bf47.tzuweichengkor.workers.dev/` 抓回比對
