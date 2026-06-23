import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://uulxupuntfamqtipdbeh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_pk5Vju0NyKDO8OnW70z6wQ_ouW5zDd8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export async function loadFromCloud(key) {
  const { data, error } = await supabase
    .from('app_data')
    .select('value')
    .eq('key', key)
    .single()
  if (error) return null
  return data.value
}

export async function saveToCloud(key, value) {
  const { error } = await supabase
    .from('app_data')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  return !error
}
