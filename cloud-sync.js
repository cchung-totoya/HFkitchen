/* 營養科廚房大挑戰 V1.3：登入、共用題庫、即時更新。 */
'use strict';
(() => {
  const config = window.KITCHEN_CLOUD_CONFIG || {};
  const configured = () => !!(config.url || config.publishableKey);
  let client = null, channel = null, poll = null, onCatalog = null, revision = -1;
  function sdk() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/supabase-js-2.57.0.min.js';
      script.onload = () => window.supabase?.createClient ? resolve() : reject(Error('Supabase 套件未載入'));
      script.onerror = () => reject(Error('無法載入 Supabase 套件，請確認 vendor/supabase-js-2.57.0.min.js 已上傳'));
      document.head.appendChild(script);
    });
  }
  async function ensureClient() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url || '') || !/^sb_publishable_/.test(config.publishableKey || ''))
      throw Error('Supabase 設定不完整：請填專案 URL 與 sb_publishable_ 開頭的 key');
    if (!client) {
      await sdk();
      client = window.supabase.createClient(config.url.replace(/\/$/, ''), config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
    }
    return client;
  }
  async function fetchCatalog(force = false) {
    const { data, error } = await client.from('kitchen_catalog').select('id,revision,players,questions,updated_at').eq('id', 1).single();
    if (error) throw Error('無法讀取共用題庫：' + error.message);
    if (force || data.revision > revision) {
      revision = data.revision;
      onCatalog?.(data);
    }
    return data;
  }
  async function open() {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) throw Error('登入已失效，請重新登入');
    const { data: member, error: roleError } = await client.from('kitchen_members').select('user_id,is_admin').eq('user_id', userData.user.id).maybeSingle();
    if (roleError) throw Error('無法確認管理者權限：' + roleError.message);
    if (!member) throw Error('此帳號尚未取得營養科廚房大挑戰的使用權限');
    const catalog = await fetchCatalog(true);
    if (channel) client.removeChannel(channel);
    channel = client.channel('kitchen-catalog-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kitchen_catalog', filter: 'id=eq.1' }, () => { fetchCatalog().catch(console.error); })
      .subscribe();
    clearInterval(poll);
    poll = setInterval(() => fetchCatalog().catch(console.error), 15000);
    return { signedIn: true, admin: !!member.is_admin, email: userData.user.email || '', revision: catalog.revision };
  }
  async function start(callback) {
    onCatalog = callback;
    await ensureClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw Error(error.message);
    return data.session ? open() : { signedIn: false };
  }
  async function signIn(email, password) {
    await ensureClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw Error('登入失敗：' + error.message);
    return open();
  }
  async function signOut() {
    clearInterval(poll); poll = null;
    if (channel) await client.removeChannel(channel);
    channel = null; revision = -1;
    if (client) await client.auth.signOut();
  }
  async function publish(players, questions) {
    if (revision < 0) throw Error('共用題庫尚未載入');
    const { data, error } = await client.from('kitchen_catalog')
      .update({ players, questions, revision: revision + 1, updated_at: new Date().toISOString() })
      .eq('id', 1).eq('revision', revision)
      .select('id,revision,players,questions,updated_at').maybeSingle();
    if (error) throw Error('發布失敗：' + error.message);
    if (!data) {
      await fetchCatalog(true);
      throw Error('其他管理者已更新資料，已載入最新版；請檢查後重新匯入');
    }
    revision = data.revision;
    onCatalog?.(data);
    return data;
  }
  window.KitchenCloud = { configured, start, signIn, signOut, publish, refresh: () => fetchCatalog(true) };
})();
