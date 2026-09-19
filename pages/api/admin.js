import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password, action, payload } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  try {
    if (action === 'list') {
      const { data: drivers, error } = await supabaseAdmin.from('drivers').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      const { data: payments } = await supabaseAdmin.from('payments').select('*').order('paid_at', { ascending: false });
      const { data: courses } = await supabaseAdmin.from('courses').select('driver_id');

      const result = drivers.map(d => {
        const driverPayments = payments.filter(p => p.driver_id === d.id);
        const lastPaid = driverPayments[0]?.paid_at || null;
        const ref = lastPaid || d.created_at;
        const daysSince = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
        const courseCount = courses.filter(c => c.driver_id === d.id).length;
        return { ...d, lastPaid, daysSince, paymentDue: daysSince >= 10, courseCount };
      });

      const { data: settings } = await supabaseAdmin.from('settings').select('*').eq('id', 1).single();
      return res.status(200).json({ drivers: result, settings });
    }

    if (action === 'markPaid') {
      const { driverId } = payload;
      const { error } = await supabaseAdmin.from('payments').insert({ driver_id: driverId });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'updateSettings') {
      const { rate_fcfa_per_km, subscription_fee } = payload;
      const { error } = await supabaseAdmin.from('settings').update({ rate_fcfa_per_km, subscription_fee }).eq('id', 1);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  }
