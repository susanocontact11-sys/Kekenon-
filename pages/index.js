import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, getOrCreateDriver } from '../lib/supabase';

const MAX_PLAUSIBLE_SPEED_KMH = 70;
const MIN_ACCURACY_M = 35;
const GPS_FIX_TIMEOUT_MS = 8000;
const WHATSAPP_NUMBER = '2290197537050';
const APP_VERSION = '1.0.0'; // à incrémenter à chaque nouvel APK

const MOMO_NUMBER = '2290197537050';
const CELTIIS_NUMBER = '2290193517846';
const PAYEE_NAME = 'DEGBOGBAHOUN Hinvo';

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI/180;
  const dLng = (b.lng - a.lng) * Math.PI/180;
  const lat1 = a.lat * Math.PI/180, lat2 = b.lat * Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function fmtDur(sec) {
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return m + ':' + String(s).padStart(2,'0');
}
function weekKey(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0,10);
}

export default function Home() {
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [regError, setRegError] = useState('');
  const [tab, setTab] = useState('course');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [settings, setSettings] = useState({ rate_fcfa_per_km: 65, subscription_fee: 100 });
  const [courses, setCourses] = useState([]);
  const [lastPaidAt, setLastPaidAt] = useState(null);

  const [tracking, setTracking] = useState(false);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [gpsState, setGpsState] = useState(null);
  const [gpsText, setGpsText] = useState('GPS inactif');
  const [showManual, setShowManual] = useState(false);
  const [manualDist, setManualDist] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const watchIdRef = useRef(null);
  const pointsRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const gpsFailTimeoutRef = useRef(null);
  const hasFixRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('drivers').select('*').eq('auth_id', user.id).maybeSingle();
        if (data) setDriver(data);
      }
      const { data: s } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (s) setSettings(s);
      setUpdateAvailable(s && s.app_version !== APP_VERSION);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (driver) { loadCourses(); loadLastPayment(); }
  }, [driver]);

  async function loadCourses() {
    const { data } = await supabase.from('courses').select('*').eq('driver_id', driver.id).order('created_at', { ascending: false });
    setCourses(data || []);
  }
  async function loadLastPayment() {
    const { data } = await supabase.from('payments').select('paid_at').eq('driver_id', driver.id).order('paid_at', { ascending: false }).limit(1).maybeSingle();
    setLastPaidAt(data ? data.paid_at : null);
  }

  async function handleRegister() {
    setRegError('');
    if (!nameInput.trim() || !phoneInput.trim()) {
      setRegError('Entre ton nom et ton numéro.');
      return;
    }
    try {
      const d = await getOrCreateDriver(nameInput.trim(), phoneInput.trim());
      setDriver(d);
    } catch (e) {
      setRegError("Ce numéro est déjà utilisé, ou une erreur s'est produite.");
    }
  }

  const updateMeter = useCallback(() => {
    if (startTimeRef.current) setDurationSec(Math.floor((Date.now() - startTimeRef.current)/1000));
  }, []);

  function onPosition(pos) {
    hasFixRef.current = true;
    clearTimeout(gpsFailTimeoutRef.current);
    setShowManual(false);
    const acc = pos.coords.accuracy;
    if (acc && acc > MIN_ACCURACY_M) {
      setGpsState('bad'); setGpsText(`Signal faible (${Math.round(acc)} m)`);
      return;
    }
    const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
    const pts = pointsRef.current;
    if (pts.length > 0) {
      const prev = pts[pts.length - 1];
      const dKm = haversineKm(prev, pt);
      const dHr = (pt.t - prev.t) / 3600000;
      const speedKmh = dHr > 0 ? dKm / dHr : 0;
      if (speedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
        setGpsState('bad'); setGpsText('Saut GPS ignoré');
        return;
      }
      setDistanceKm(d => d + dKm);
    }
    pointsRef.current = [...pts, pt];
    setGpsState('ok'); setGpsText('GPS actif');
  }

  function startTracking() {
    if (!navigator.geolocation) { setShowManual(true); setGpsState('bad'); setGpsText('GPS non supporté'); return; }
    setReceipt(null);
    setSaveError(null);
    setTracking(true);
    pointsRef.current = [];
    setDistanceKm(0); setDurationSec(0);
    startTimeRef.current = Date.now();
    hasFixRef.current = false;
    setGpsState(null); setGpsText('Recherche du signal…');

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, () => {
      setGpsState('bad'); setGpsText('Signal indisponible');
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 6000 });

    gpsFailTimeoutRef.current = setTimeout(() => { if (!hasFixRef.current) setShowManual(true); }, GPS_FIX_TIMEOUT_MS);
    timerRef.current = setInterval(updateMeter, 1000);
  }

  async function stopTracking() {
    setTracking(false);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    clearInterval(timerRef.current);
    clearTimeout(gpsFailTimeoutRef.current);

    const finalDistance = distanceKm;
    const finalDuration = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current)/1000) : 0;
    const price = Math.round(finalDistance * settings.rate_fcfa_per_km);

    if (finalDistance > 0) {
      const nextNumber = courses.length + 1;
      const { error } = await supabase.from('courses').insert({
        driver_id: driver.id,
        course_number: nextNumber,
        distance_km: Number(finalDistance.toFixed(2)),
        duration_sec: finalDuration,
        price
      });
      if (error) {
        setSaveError(error.message);
      } else {
        setSaveError(null);
        await loadCourses();
        setReceipt({ distanceKm: finalDistance, price, durationSec: finalDuration });
      }
    }

    setGpsState(null); setGpsText('GPS inactif'); setShowManual(false);
    pointsRef.current = []; setDistanceKm(0); setDurationSec(0);
    startTimeRef.current = null;
  }

  function dismissReceipt() {
    setReceipt(null);
  }

  function confirmManualDistance() {
    const val = parseFloat(manualDist);
    if (!val || val <= 0) return;
    setDistanceKm(val);
    setShowManual(false);
    setGpsState('ok'); setGpsText('Distance saisie manuellement');
  }

  function daysSinceReference() {
    const ref = lastPaidAt || driver?.created_at;
    if (!ref) return 0;
    return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
  }
  const daysSince = driver ? daysSinceReference() : 0;
  const paymentDue = daysSince >= 10;

  if (loading) return <div id="app"><main><p style={{textAlign:'center', paddingTop: 80}}>Chargement…</p></main></div>;

  if (!driver) {
    return (
      <div id="app">
        <main>
          <div className="reg-box">
            <h1>Kèkè</h1>
            <p>Compteur de course pour zem. Entre tes infos pour commencer.</p>
            <input placeholder="Ton nom" value={nameInput} onChange={e => setNameInput(e.target.value)} />
            <input placeholder="Ton numéro" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} />
            <button onClick={handleRegister}>Commencer</button>
            {regError && <div className="err">{regError}</div>}
          </div>
        </main>
      </div>
    );
  }

  const currentPrice = Math.round(distanceKm * settings.rate_fcfa_per_km);
  const today = new Date().toISOString().slice(0,10);
  const thisWeek = weekKey(new Date());
  let sumToday = 0, sumWeek = 0;
  const byDay = {};
  courses.forEach(c => {
    const d = c.created_at.slice(0,10);
    if (d === today) sumToday += c.price;
    if (weekKey(c.created_at) === thisWeek) sumWeek += c.price;
    (byDay[d] = byDay[d] || []).push(c);
  });

  return (
    <div id="app">
      <header>
        <div className="brand">Bonjour <span>{driver.name}</span></div>
        <div className="tab-switch">
          <button className={'tab-btn' + (tab==='course'?' active':'')} onClick={() => setTab('course')}>Course</button>
          <button className={'tab-btn' + (tab==='hist'?' active':'')} onClick={() => setTab('hist')}>Historique</button>
          <button className={'tab-btn' + (tab==='contact'?' active':'')} onClick={() => setTab('contact')}>Aide</button>
        </div>
      </header>

      <main>
        {tab === 'course' && (
          <>
            {updateAvailable && (
              <div className="week-banner">
                <div className="txt">Nouvelle version disponible</div>
                <a href={settings.apk_url} className="pay-btn">Mettre à jour</a>
              </div>
            )}

            {paymentDue && (
              <div className="week-banner-full">
                <div className="txt">Abonnement dû : <b>{settings.subscription_fee} FCFA</b></div>
                <div className="pay-instructions">
                  Nom à vérifier avant envoi : <b>{PAYEE_NAME}</b>
                </div>
                <div style={{display:'flex', gap:8, marginTop:8}}>
                  <div style={{flex:1}}>
                    <div className="pay-instructions">MoMo : <b>{MOMO_NUMBER}</b></div>
                    <a href="tel:*880%23" className="pay-btn">Payer via MoMo</a>
                  </div>
                  <div style={{flex:1}}>
                    <div className="pay-instructions">Celtiis : <b>{CELTIIS_NUMBER}</b></div>
                    <a href="tel:*889%23" className="pay-btn">Payer via Celtiis</a>
                  </div>
                </div>
              </div>
            )}

            <div className="meter">
              <div className="label">{tracking ? 'Course en cours' : 'Prêt'}</div>
              <div className="course-n">Course n°{courses.length + 1}</div>
              <div className="price"><span>{currentPrice}</span><span className="unit">FCFA</span></div>
              <div className="sub">
                <div>Distance <b>{distanceKm.toFixed(2)}</b> km</div>
                <div>Durée <b>{fmtDur(durationSec)}</b></div>
              </div>
              <div className="gps-flag"><div className={'gps-dot' + (gpsState ? ' '+gpsState : '')}></div><span>{gpsText}</span></div>
            </div>

            {saveError && (
              <div className="manual-fallback">
                Erreur d'enregistrement : {saveError}
              </div>
            )}

            {receipt && !tracking && (
              <div className="manual-fallback" style={{borderStyle:'solid', textAlign:'center'}}>
                <div style={{fontSize:15, fontWeight:700, color:'#F5F0E6', marginBottom:6}}>Course terminée</div>
                <div>Distance : <b>{receipt.distanceKm.toFixed(2)} km</b></div>
                <div>Prix : <b>{receipt.price} FCFA</b></div>
                <button onClick={dismissReceipt}>Nouvelle course</button>
              </div>
            )}

            <button className={'big-btn ' + (tracking ? 'stop' : 'start')} onClick={() => tracking ? stopTracking() : startTracking()}>
              {tracking ? 'Fin' : 'Début'}
            </button>

            {showManual && (
              <div className="manual-fallback">
                Signal GPS introuvable. Entre la distance estimée.
                <input type="number" inputMode="decimal" placeholder="Distance en km" value={manualDist} onChange={e => setManualDist(e.target.value)} />
                <button onClick={confirmManualDistance}>Utiliser cette distance</button>
              </div>
            )}

            <div className="rate-display">Tarif : {settings.rate_fcfa_per_km} FCFA/km</div>
          </>
        )}

        {tab === 'hist' && (
          <>
            <div className="hist-summary">
              <div className="hist-card"><div className="n">{sumToday}</div><div className="l">FCFA aujourd'hui</div></div>
              <div className="hist-card"><div className="n">{sumWeek}</div><div className="l">FCFA cette semaine</div></div>
              <div className="hist-card"><div className="n">{courses.length}</div><div className="l">courses total</div></div>
            </div>
            {courses.length === 0 ? (
              <div className="empty">Aucune course enregistrée pour l'instant.</div>
            ) : Object.keys(byDay).sort().reverse().map(day => (
              <div className="day-group" key={day}>
                <h3>{day === today ? "Aujourd'hui" : new Date(day).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})}</h3>
                {byDay[day].map(c => (
                  <div className="course-row" key={c.id}>
                    <span className="t">{new Date(c.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</span>
                    <span><span className="p">{c.price} F</span><span className="d">· {c.distance_km} km</span></span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {tab === 'contact' && (
          <div className="contact-box">
            <p>Besoin d'aide ? Contacte le service client directement.</p>
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Bonjour, j'ai besoin d'aide avec l'app`}>Ouvrir WhatsApp</a>
          </div>
        )}
      </main>
    </div>
  );
      }
