const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---------- Гости ----------

async function upsertGuest({ telegram_id, name, phone }) {
  const { data, error } = await supabase
    .from('guests')
    .upsert({ telegram_id, name, phone }, { onConflict: 'telegram_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getGuest(telegram_id) {
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('telegram_id', telegram_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Визиты ----------

async function addVisit({ telegram_id, checkin_code, receipt_code }) {
  const { data, error } = await supabase
    .from('visits')
    .insert({ telegram_id, checkin_code, receipt_code })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getVisitsByGuest(telegram_id) {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('telegram_id', telegram_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getAllVisits({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('visits')
    .select('*, guests(name, phone)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ---------- Коды для QR ----------

async function createActiveCode({ code, label, expires_at }) {
  const { data, error } = await supabase
    .from('active_codes')
    .insert({ code, label, expires_at })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function isCodeValid(code) {
  const { data, error } = await supabase
    .from('active_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

async function listActiveCodes() {
  const { data, error } = await supabase
    .from('active_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// ---------- Персонал ----------

async function getStaff(telegram_id) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('telegram_id', telegram_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = {
  upsertGuest,
  getGuest,
  addVisit,
  getVisitsByGuest,
  getAllVisits,
  createActiveCode,
  isCodeValid,
  listActiveCodes,
  getStaff,
};
