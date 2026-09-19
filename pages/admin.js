import { useState, useEffect } from 'react';

export default function Admin() {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [settings, setSettings] = useState({ rate_fcfa_per_km: 70, subscription_fee: 200 });
  const [rateInput, setRateInput] = useState('');
  const [feeInput, setFeeInput] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('admin-pw');
    if (saved) { setPassword(saved); tryLoad(saved); }
  }, []);

  async function call(action, payload) {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, action, payload })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  }

  async function tryLoad(pw) {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, action: 'list' })
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error); return; }
      setDrivers(data.drivers);
      setSettings(data.settings);
      setRateInput(data.settings.rate_fcfa_per_km);
      setFeeInput(data.settings.subscription_fee);
      setUnlocked(true);
      sessionStorage.setItem('admin-pw', pw);
    } catch (e) { setErr('Erreur de connexion'); }
  }

  async function markPaid(driverId) {
    await call('markPaid', { driverId });
    tryLoad(password);
  }

  async function saveSettings() {
    await call('updateSettings', { rate_fcfa_per_km: Number(rateInput), subscription_fee: Number(feeInput) });
    tryLoad(password);
  }

  if (!unlocked) {
    return (
      <div id="app">
        <main>
          <div className="reg-box">
            <h1>Admin</h1>
            <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} />
            <button onClick={() => tryLoad(password)}>Entrer</button>
            {err && <div className="err">{err}</div>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div id="app">
      <header><div className="brand">Admin</div></header>
      <main>
        <h3 style={{fontSize:14, color:'rgba(245,240,230,0.6)'}}>Réglages</h3>
        <div className="week-banner" style={{flexDirection:'column', alignItems:'stretch', gap:8}}>
          <label style={{fontSize:13}}>Tarif (FCFA/km)
            <input type="number" value={rateInput} onChange={e => setRateInput(e.target.value)}
              style={{width:'100%', marginTop:4, padding:8, borderRadius:8, background:'rgba(245,240,230,0.08)', border:'1px solid rgba(245,240,230,0.2)', color:'#F5F0E6'}} />
          </label>
          <label style={{fontSize:13}}>Abonnement (FCFA)
            <input type="number" value={feeInput} onChange={e => setFeeInput(e.target.value)}
              style={{width:'100%', marginTop:4, padding:8, borderRadius:8, background:'rgba(245,240,230,0.08)', border:'1px solid rgba(245,240,230,0.2)', color:'#F5F0E6'}} />
          </label>
          <button onClick={saveSettings} style={{background:'#E2A63B', border:'none', borderRadius:10, padding:10, fontWeight:700}}>Enregistrer</button>
        </div>

        <h3 style={{fontSize:14, color:'rgba(245,240,230,0.6)', marginTop:24}}>Chauffeurs ({drivers.length})</h3>
        {drivers.map(d => (
          <div className="course-row" key={d.id} style={{flexDirection:'column', alignItems:'stretch', gap:6}}>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <b>{d.name}</b><span className="t">{d.phone}</span>
            </div>
            <div className="t">{d.courseCount} courses · dernier paiement : {d.lastPaid ? new Date(d.lastPaid).toLocaleDateString('fr-FR') : 'jamais'} ({d.daysSince}j)</div>
            {d.paymentDue ? (
              <button onClick={() => markPaid(d.id)} style={{background:'#B54B3A', color:'#F5F0E6', border:'none', borderRadius:8, padding:8, fontWeight:600}}>
                Marquer payé
              </button>
            ) : (
              <span style={{color:'#3C7A6B', fontSize:13}}>✓ à jour</span>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
