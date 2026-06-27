/**
 * kakalove-proxy  —  v4：列表頁 + 單品頁詳細資料
 *
 * 流程：
 *   1. 抓四個分類頁列表，取得 handle / title / cat / price（同 v3）
 *   2. 對每個品項 fetch 單品頁，抽出：
 *      - flavors（主風味，逗號切陣列）
 *      - roast  （烘焙度）
 *      - desc   （風味描述 或 Coffee Review 盲測段落）
 *      - process（處理法，從品名推斷）
 *   3. 並發控制：同時最多 CONCURRENCY 個單品 request
 *
 * 兩種描述格式：
 *   格式一（CR95）：主風味：x, y  /  烘焙度：z  /  Coffee Review 盲測段落
 *   格式二（一般）：主風味: x, y  /  烘焙度: z  /  風味描述: ...
 *   冒號全形（：）/ 半形（:）皆相容
 */

const BASE_URL   = 'https://www.kakalovecafe.com.tw';
const CATEGORIES = [
  { path: '/categories/550002c8e36c8e3e250000c3', cat: '非洲' },
  { path: '/categories/5508003ae37ec6a3a800013e', cat: '北/中/南美洲' },
  { path: '/categories/5500031e2ed0f2264000001f', cat: '亞洲' },
  { path: '/categories/blend',                    cat: '配方豆' },
];
const MAX_PAGES   = 20;
const CONCURRENCY = 5;   // 單品頁並發上限

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9',
  'Referer':         'https://www.kakalovecafe.com.tw/',
  'Cache-Control':   'no-cache',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── 列表頁解析（同 v3）────────────────────────────────────────────────────────

function parseProductsFromHtml(html, cat) {
  const products = [];
  const anchorRe = /<a\s[^>]*class="[^"]*Product-item[^"]*"[^>]*href="([^"]+)"[^>]*>/gi;
  let aMatch;

  while ((aMatch = anchorRe.exec(html)) !== null) {
    const href     = aMatch[1];
    const startIdx = aMatch.index + aMatch[0].length;
    const chunk    = html.slice(startIdx, startIdx + 4000);

    const handleMatch = href.match(/\/products\/([^?#/]+)/);
    const handle = handleMatch ? handleMatch[1] : '';
    if (!handle) continue;

    const titleMatch = chunk.match(/<div[^>]+class="[^"]*\btitle\b[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : handle;

    let price = '0';
    const commentPrice = chunk.match(/<!--\s*NT\$\s*([\d,]+)\s*-->/);
    const spanPrice    = chunk.match(/class="[^"]*sl-price[^"]*"[^>]*>\s*NT\$\s*([\d,]+)/i);
    if (commentPrice) price = commentPrice[1].replace(/,/g, '');
    else if (spanPrice) price = spanPrice[1].replace(/,/g, '');

    // 處理法：從品名推斷（比描述文字更精確，避免誤判）
    const tl = title.toLowerCase();
    let process = '';
    if (/厭氧|anaerobic/.test(tl))                  process = '厭氧';
    else if (/蜜處理|honey\s*proc/.test(tl))         process = '蜜處理';
    else if (/濕剝|wet.hull|giling/.test(tl))        process = '濕剝法';
    else if (/日曬|natural/.test(tl))                process = '日曬';
    else if (/水洗|washed/.test(tl))                 process = '水洗';
    else if (/配方|blend/.test(tl))                  process = '配方';

    products.push({ handle, title, cat, price, process, url: BASE_URL + '/products/' + handle });
  }
  return products;
}

// ── 單品頁解析 ────────────────────────────────────────────────────────────────

function parseDetailFromHtml(html) {
  // 先把 HTML tag 全拿掉，只留純文字（保留換行）
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'");

  // 共用 regex：同時接受全形（：）和半形（:）冒號
  const COL = '[：:]\\s*';

  // 主風味
  let flavors = [];
  const flavorMatch = text.match(new RegExp(`主風味${COL}([^\n]+)`));
  if (flavorMatch) {
    flavors = flavorMatch[1]
      .split(/[,，、]/)
      .map(f => f.trim())
      .filter(Boolean);
  }

  // 烘焙度
  let roast = '';
  const roastMatch = text.match(new RegExp(`烘焙度${COL}([^\n]+)`));
  if (roastMatch) roast = roastMatch[1].trim();

  // 風味描述
  // 格式二：直接取「風味描述:」那行
  let desc = '';
  const descMatch = text.match(new RegExp(`風味描述${COL}([^\n]+)`));
  if (descMatch) {
    desc = descMatch[1].trim();
  } else {
    // 格式一（CR95）：抓 Coffee Review 盲測段落
    // 特徵：「Coffee Review 盲測」或「Coffee Review Blind Assessment」之後的段落
    const crMatch = text.match(/Coffee\s*Review\s*盲測[^：:\n]*[：:]\s*([^\n]{20,})/i);
    if (crMatch) desc = crMatch[1].trim();
  }

  return { flavors, roast, desc };
}

// ── 並發控制：每次最多 CONCURRENCY 個 fetch ───────────────────────────────────

async function fetchDetail(product, errors) {
  try {
    const res = await fetch(product.url, { headers: BROWSER_HEADERS, redirect: 'follow' });
    if (!res.ok) {
      errors.push(`detail ${product.handle} → HTTP ${res.status}`);
      return;
    }
    const html   = await res.text();
    const detail = parseDetailFromHtml(html);
    Object.assign(product, detail);
  } catch (err) {
    errors.push(`detail ${product.handle} → ${err.message}`);
  }
}

async function fetchAllDetails(products, errors) {
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(p => fetchDetail(p, errors)));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // URL param: ?detail=0 可跳過單品頁抓取（快速測試用）
    const skipDetail = new URL(request.url).searchParams.get('detail') === '0';

    const products    = [];
    const seenHandles = new Set();
    const errors      = [];

    // ── Step 1：抓列表頁 ──
    for (const { path, cat } of CATEGORIES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${BASE_URL}${path}?page=${page}`;
        try {
          const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
          if (!res.ok) { errors.push(`${path} p${page} → ${res.status}`); break; }

          const html      = await res.text();
          const pageItems = parseProductsFromHtml(html, cat);
          if (pageItems.length === 0) break;

          let newOnPage = 0;
          for (const p of pageItems) {
            if (!seenHandles.has(p.handle)) {
              seenHandles.add(p.handle);
              products.push(p);
              newOnPage++;
            }
          }
          if (newOnPage === 0) break;

        } catch (err) {
          errors.push(`${path} p${page} → ${err.message}`);
          break;
        }
      }
    }

    if (products.length === 0) {
      return Response.json(
        { error: 'no_products', details: errors },
        { status: 502, headers: CORS }
      );
    }

    // ── Step 2：抓單品頁詳細資料 ──
    if (!skipDetail) {
      await fetchAllDetails(products, errors);
    }

    // ── Step 3：整理回傳格式（與舊版 Worker 相容）──
    const output = products.map(p => ({
      handle:    p.handle,
      title:     p.title,
      cat:       p.cat,
      url:       p.url,
      variants:  [{ price: p.price || '0' }],
      flavors:   p.flavors  || [],
      roast:     p.roast    || '',
      desc:      p.desc     || '',
      process:   p.process  || '',
      tags:      '',
      body_html: '',
      _source:   'html_v4',
    }));

    return Response.json(
      { products: output, _meta: { source: 'html_v4', count: output.length, errors } },
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
    );
  },
};
