// ═══════════════════════════════════════════════════════════════
// 品項目錄重建腳本（在正式站按 F12 → Console 貼上執行）
//
// 兩段各自獨立，整段複製貼上即可，不需要先跑別的東西。
//
// 策略：全程保留至少一筆文件，集合永不為空，因此不管別人的裝置
//       還開著哪一版頁面，都不會觸發舊版的 DEFAULT_PRODUCTS 自動植入。
//
// 錨點品項：hip-hop-blend-1（嘻哈配方）
//   - 官網現在還有這支，doc id 已經等於 handle
//   - 它的人工 emoji 🎵 已記在 index.html 的 CURATED_EMOJI，最後重建時會還原
//
// 訂單與歷史紀錄不受影響（送出訂單時已快照品名與單價）。
// ═══════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────
// 【第 1 段】刪除除了錨點以外的所有品項（預期 43 筆）
// 執行完 → 到管理員分頁跑「從 Kakalove 同步」→「⚡ 一鍵全部新增」
// ───────────────────────────────────────────────────────────────
(async () => {
  const KEEP_ID = 'hip-hop-blend-1';

  const snap = await db.collection('products').get();
  const keeper = snap.docs.find(d => d.id === KEEP_ID);
  if (!keeper) {
    console.error(`❌ 找不到錨點品項「${KEEP_ID}」，為避免清空集合，已中止。`);
    console.log('目前的 doc id 清單：', snap.docs.map(d => d.id));
    return;
  }

  const targets = snap.docs.filter(d => d.id !== KEEP_ID);
  console.log(`目前 ${snap.size} 筆，保留「${keeper.data().name_zh}」，準備刪除 ${targets.length} 筆…`);

  let n = 0;
  for (let i = 0; i < targets.length; i += 400) {   // Firestore batch 上限 500
    const b = db.batch();
    targets.slice(i, i + 400).forEach(d => { b.delete(d.ref); n++; });
    await b.commit();
    console.log(`已刪除 ${n}/${targets.length}`);
  }

  const after = await db.collection('products').get();
  console.log(`✅ 完成，剩下 ${after.size} 筆：${after.docs.map(d => d.id).join(', ')}`);
  console.log('接著到「管理員」分頁 →「從 Kakalove 同步」→「⚡ 一鍵全部新增」');
})();


// ───────────────────────────────────────────────────────────────
// 【第 2 段】同步完成後才執行：刪掉錨點，讓它也能以新資料重建
// 此時集合已有 37 筆，刪這一筆不會變空
// 執行完 → 再跑一次同步，這支會出現在新品清單，一併新增即可
// ───────────────────────────────────────────────────────────────
/*
(async () => {
  const KEEP_ID = 'hip-hop-blend-1';

  const snap = await db.collection('products').get();
  if (snap.size <= 1) {
    console.error('❌ 集合只剩這一筆，刪掉會變空集合。請先完成同步再執行。');
    return;
  }
  await db.collection('products').doc(KEEP_ID).delete();
  const after = await db.collection('products').get();
  console.log(`✅ 已刪除錨點，目前 ${after.size} 筆。請再跑一次「從 Kakalove 同步」把它加回來。`);
})();
*/
