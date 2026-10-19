import { createClient } from '@supabase/supabase-js';

// วาง URL และ Key จริงตรงนี้ได้เลย
const supabaseUrl = 'https://mfvpytnyrudokngrbnwc.supabase.co';
const supabaseAnonKey = 'sb_publishable_k2ItVm9MZ0967OuzQjOfOw_VNnrU2h8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);