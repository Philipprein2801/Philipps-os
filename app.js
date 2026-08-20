(() => {
  'use strict';

  const STORAGE_KEY = 'philippOS.v5';
  const LEGACY_KEYS = ['philippOS.v4', 'philippOS'];
  const DAY_MS = 86400000;

  const DEFAULT_SETTINGS = {
    targetGym: 3,
    targetHome: 1,
    targetProtein: 170,
    targetWater: 3000,
    targetSleep: 450,
    targetFocusBlocks: 5,
    targetFutureBlocks: 3,
    focusBlockMinutes: 60,
    futureBlockMinutes: 45,
    smallGlassMl: 250,
    largeGlassMl: 500
  };

  let state = loadState();
  let activeView = 'home';
  let activeCheckin = 'morning';
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function localISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseISODate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
    const [y,m,d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }
  function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
  function sum(arr) { return arr.reduce((a,b) => a + (Number(b) || 0), 0); }
  function avg(arr) { return arr.length ? sum(arr) / arr.length : null; }

  function emptyState() {
    return { version: 5, settings: { ...DEFAULT_SETTINGS }, entries: {}, meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) return normalizeState(JSON.parse(legacy));
      }
    } catch (err) {
      console.warn('Local state could not be loaded', err);
    }
    return emptyState();
  }

  function normalizeState(input) {
    const base = emptyState();
    if (!input || typeof input !== 'object') return base;
    const entries = input.entries && typeof input.entries === 'object' ? input.entries : {};
    const normalizedEntries = {};
    Object.entries(entries).forEach(([date, entry]) => {
      if (!parseISODate(date) || !entry || typeof entry !== 'object') return;
      normalizedEntries[date] = normalizeEntry(date, entry);
    });
    return {
      version: 5,
      settings: { ...DEFAULT_SETTINGS, ...(input.settings || {}) },
      entries: normalizedEntries,
      meta: { ...base.meta, ...(input.meta || {}), importedVersion: input.version || null }
    };
  }

  function normalizeEntry(date, entry) {
    const e = { date, morning: {}, evening: {} };
    const m = entry.morning && typeof entry.morning === 'object' ? entry.morning : {};
    const v = entry.evening && typeof entry.evening === 'object' ? entry.evening : {};

    e.morning = {
      savedAt: m.savedAt || null,
      entryDate: m.entryDate || date,
      bedTime: m.bedTime || '',
      wakeTime: m.wakeTime || '',
      nightQuality: mapNightQuality(m.nightQuality),
      morningEnergy: Number(m.morningEnergy ?? m.sleepFeel ?? 0) || 0,
      dailyWins: Array.isArray(m.dailyWins) ? m.dailyWins.slice(0,3) : (m.dailyWin ? [m.dailyWin] : []),
      focusPlan: Number(m.focusPlan || 0) || 0,
      blockers: Array.isArray(m.blockers) ? m.blockers : [],
      ifThen: m.ifThen || ''
    };

    const legacyTraining = v.training || (Array.isArray(v.movement) && v.movement.includes('gym') ? 'gym' : '');
    e.evening = {
      savedAt: v.savedAt || null,
      entryDate: v.entryDate || date,
      training: mapTraining(legacyTraining),
      proteinBreakfast: numOrZero(v.proteinBreakfast),
      proteinLunch: numOrZero(v.proteinLunch),
      proteinDinner: numOrZero(v.proteinDinner),
      proteinOther: numOrZero(v.proteinOther),
      legacyProteinLevel: Number.isFinite(Number(v.protein)) ? Number(v.protein) : null,
      smallGlasses: numOrZero(v.smallGlasses),
      largeGlasses: numOrZero(v.largeGlasses),
      legacyWaterLevel: Number.isFinite(Number(v.water)) ? Number(v.water) : null,
      focusMinutes: numOrZero(v.focusMinutes),
      futureMinutes: numOrZero(v.futureMinutes ?? v.futureTime),
      winStatuses: normalizeWinStatuses(v.winStatuses || v.dailyWinStatuses, e.morning.dailyWins),
      stress: Number(v.stress || 0) || 0,
      mood: Number(v.mood ?? v.daySummary ?? 0) || 0,
      outdoorMinutes: normalizeOutdoor(v.outdoorMinutes ?? v.outdoors),
      qualityTime: Boolean(v.qualityTime),
      people: Array.isArray(v.people) ? v.people : Array.isArray(v.life) ? v.life : [],
      supplements: Array.isArray(v.supplements) ? v.supplements : [],
      caffeineDrinks: numOrZero(v.caffeineDrinks ?? v.caffeine),
      phoneDistracted: Boolean(v.phoneDistracted),
      note: v.note || v.eveningNote || ''
    };
    return e;
  }

  function numOrZero(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }
  function mapNightQuality(v) {
    if (v === 'durchgeschlafen' || v === 'einmal' || v === 'mehrfach') return v;
    return '';
  }
  function mapTraining(v) {
    if (!v) return '';
    const s = String(v).toLowerCase();
    if (['gym','oberkörper','unterkörper','fullbody','ganzkörper'].includes(s)) return 'gym';
    if (['home','home-training','hometraining'].includes(s)) return 'home';
    if (['pause','rest','nichts'].includes(s)) return 'pause';
    return '';
  }
  function normalizeOutdoor(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n <= 4) return [0,15,30,60][Math.max(0, Math.min(3, Math.round(n)-1))] || 0;
    return n;
  }
  function normalizeWinStatuses(statuses, wins) {
    if (!Array.isArray(statuses)) return wins.map(() => false);
    return wins.map((_, i) => {
      const s = statuses[i];
      return s === true || s === 'yes' || s === 'done' || s === 'erledigt';
    });
  }

  function saveState() {
    state.meta.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getEntry(date, create = false) {
    if (!state.entries[date] && create) state.entries[date] = normalizeEntry(date, { date, morning: {}, evening: {} });
    return state.entries[date] || null;
  }

  function weekStart(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function dateRange(start, days) { return Array.from({length: days}, (_,i) => addDays(start, i)); }
  function fmtDate(date, options = {}) { return new Intl.DateTimeFormat('de-DE', options).format(date); }
  function currentSelectedDate() { return parseISODate($('entryDate').value) || new Date(); }
  function selectedDateISO() { return localISO(currentSelectedDate()); }

  function sleepMinutes(bed, wake) {
    if (!/^\d{2}:\d{2}$/.test(bed || '') || !/^\d{2}:\d{2}$/.test(wake || '')) return null;
    const [bh,bm] = bed.split(':').map(Number), [wh,wm] = wake.split(':').map(Number);
    let start = bh*60+bm, end = wh*60+wm;
    if (end <= start) end += 1440;
    const duration = end - start;
    return duration > 0 && duration <= 1080 ? duration : null;
  }

  function proteinTotal(v) { return sum([v.proteinBreakfast, v.proteinLunch, v.proteinDinner, v.proteinOther]); }
  function waterTotal(v, settings = state.settings) { return (Number(v.smallGlasses)||0)*Number(settings.smallGlassMl) + (Number(v.largeGlasses)||0)*Number(settings.largeGlassMl); }

  function statusColor(ratio) {
    if (ratio >= .8) return 'var(--green)';
    if (ratio >= .5) return 'var(--yellow)';
    return 'var(--red)';
  }

  function expectedRatioForWeek(actual, target, elapsedDays, targetType='weekly') {
    if (!target) return 0;
    if (targetType === 'daily') {
      const expected = Math.max(1, elapsedDays);
      return actual / expected;
    }
    const expected = Math.max(target / 7 * Math.max(1, elapsedDays), Math.min(1, target));
    return actual / expected;
  }

  function setRing(id, ratio, color) {
    const el = $(id);
    const pct = clamp(ratio, 0, 1);
    el.style.setProperty('--pct', `${pct * 100}%`);
    el.style.setProperty('--ring-color', color || statusColor(pct));
  }

  function renderDashboard() {
    const today = new Date();
    const start = weekStart(today);
    const dates = dateRange(start, 7);
    const todayISO = localISO(today);
    const elapsedDays = Math.max(1, Math.min(7, Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate(),12) - start) / DAY_MS) + 1));
    const entries = dates.map(d => getEntry(localISO(d))).filter(Boolean);
    const settings = state.settings;

    $('weekRange').textContent = `${fmtDate(start,{day:'2-digit',month:'2-digit'})} – ${fmtDate(addDays(start,6),{day:'2-digit',month:'2-digit',year:'numeric'})}`;

    const gym = entries.filter(e => e.evening.training === 'gym').length;
    const home = entries.filter(e => e.evening.training === 'home').length;
    $('trainingValue').textContent = `${gym} / ${settings.targetGym}`;
    $('homeBonus').textContent = `Home Bonus ${home} / ${settings.targetHome}`;
    const trainRatio = gym / settings.targetGym;
    setRing('trainingRing', trainRatio, statusColor(expectedRatioForWeek(gym, settings.targetGym, elapsedDays)));

    const proteinDays = entries.filter(e => proteinTotal(e.evening) >= settings.targetProtein).length;
    $('proteinValue').textContent = `${proteinDays} / 7`;
    $('proteinNote').textContent = `Tagesziel ${settings.targetProtein} g`;
    setRing('proteinRing', proteinDays / 7, statusColor(expectedRatioForWeek(proteinDays, 7, elapsedDays, 'daily')));

    const waterDays = entries.filter(e => waterTotal(e.evening) >= settings.targetWater).length;
    $('waterValue').textContent = `${waterDays} / 7`;
    $('waterNote').textContent = `Tagesziel ${(settings.targetWater/1000).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} L`;
    setRing('waterRing', waterDays / 7, statusColor(expectedRatioForWeek(waterDays, 7, elapsedDays, 'daily')));

    const focusMins = sum(entries.map(e => e.evening.focusMinutes));
    const focusBlocks = Math.floor(focusMins / settings.focusBlockMinutes);
    $('focusValue').textContent = `${focusBlocks} / ${settings.targetFocusBlocks}`;
    $('focusNote').textContent = `1 Block = ${settings.focusBlockMinutes} Min.`;
    setRing('focusRing', focusBlocks / settings.targetFocusBlocks, statusColor(expectedRatioForWeek(focusBlocks, settings.targetFocusBlocks, elapsedDays)));

    const futureMins = sum(entries.map(e => e.evening.futureMinutes));
    const futureBlocks = Math.floor(futureMins / settings.futureBlockMinutes);
    $('futureValue').textContent = `${futureBlocks} / ${settings.targetFutureBlocks}`;
    $('futureNote').textContent = `1 Block = ${settings.futureBlockMinutes} Min.`;
    setRing('futureRing', futureBlocks / settings.targetFutureBlocks, statusColor(expectedRatioForWeek(futureBlocks, settings.targetFutureBlocks, elapsedDays)));

    const sleeps = entries.map(e => sleepMinutes(e.morning.bedTime, e.morning.wakeTime)).filter(v => Number.isFinite(v));
    const sleepAvg = avg(sleeps);
    $('sleepValue').textContent = sleepAvg == null ? '–' : `${Math.floor(sleepAvg/60)}:${String(Math.round(sleepAvg%60)).padStart(2,'0')} h`;
    $('sleepNote').textContent = `Ziel ${Math.floor(settings.targetSleep/60)}:${String(settings.targetSleep%60).padStart(2,'0')} h`;
    setRing('sleepRing', sleepAvg == null ? 0 : sleepAvg/settings.targetSleep, sleepAvg == null ? 'var(--neutral)' : statusColor(sleepAvg/settings.targetSleep));

    const moodsByDay = dates.map(d => getEntry(localISO(d))?.evening?.mood || 0);
    const moodVals = moodsByDay.filter(Boolean);
    const moodAvg = avg(moodVals);
    $('moodValue').textContent = moodAvg == null ? '–' : round1(moodAvg).toLocaleString('de-DE');
    setRing('moodRing', moodAvg == null ? 0 : moodAvg/5, moodAvg == null ? 'var(--neutral)' : statusColor((moodAvg-1)/4));
    renderSpark('moodSpark', moodsByDay, 5);

    const wins = [];
    entries.forEach(e => e.morning.dailyWins.forEach((w,i) => { if (w && w.trim()) wins.push(Boolean(e.evening.winStatuses[i])); }));
    $('winsRate').textContent = wins.length ? `${Math.round(wins.filter(Boolean).length / wins.length * 100)}%` : '–';
    $('outdoorDays').textContent = entries.filter(e => e.evening.outdoorMinutes >= 30).length;
    $('qualityDays').textContent = entries.filter(e => e.evening.qualityTime || (e.evening.people && e.evening.people.length > 0)).length;

    const componentScores = [
      clamp(gym/settings.targetGym,0,1),
      clamp(proteinDays/Math.max(1,elapsedDays),0,1),
      clamp(waterDays/Math.max(1,elapsedDays),0,1),
      clamp(focusBlocks/settings.targetFocusBlocks,0,1),
      clamp(futureBlocks/settings.targetFutureBlocks,0,1),
      sleepAvg == null ? null : clamp(sleepAvg/settings.targetSleep,0,1)
    ].filter(v => v != null);
    const score = componentScores.length ? Math.round(avg(componentScores)*100) : 0;
    const orb = $('weekScore');
    orb.textContent = `${score}%`;
    orb.style.setProperty('--score', `${score*3.6}deg`);
    orb.style.setProperty('--score-color', statusColor(score/100));

    renderPriority({ gym, proteinDays, waterDays, focusBlocks, futureBlocks, sleepAvg, elapsedDays, settings, todayISO });
  }

  function renderPriority(data) {
    const candidates = [
      { ratio: expectedRatioForWeek(data.gym,data.settings.targetGym,data.elapsedDays), title:'Training schützen', text:`Dir fehlen noch ${Math.max(0,data.settings.targetGym-data.gym)} Gym-Einheit(en) bis zum Wochenziel.` },
      { ratio: data.proteinDays/Math.max(1,data.elapsedDays), title:'Protein zuerst absichern', text:`Protein-Ziel bisher an ${data.proteinDays} von ${data.elapsedDays} erfassten Wochentagen erreicht.` },
      { ratio: data.waterDays/Math.max(1,data.elapsedDays), title:'Wasser einfach machen', text:`Tagesziel bisher an ${data.waterDays} von ${data.elapsedDays} Wochentagen erreicht.` },
      { ratio: expectedRatioForWeek(data.focusBlocks,data.settings.targetFocusBlocks,data.elapsedDays), title:'Einen Fokusblock setzen', text:`Aktuell ${data.focusBlocks}/${data.settings.targetFocusBlocks} Fokusblöcke. Ein klarer Block reicht als nächster Schritt.` },
      { ratio: expectedRatioForWeek(data.futureBlocks,data.settings.targetFutureBlocks,data.elapsedDays), title:'Zukunftszeit reservieren', text:`Aktuell ${data.futureBlocks}/${data.settings.targetFutureBlocks} Blöcke für Buch, Business oder Planung.` }
    ];
    candidates.sort((a,b) => a.ratio-b.ratio);
    const p = candidates[0];
    $('priorityTitle').textContent = p.title;
    $('priorityText').textContent = p.text;
  }

  function renderSpark(id, values, max) {
    const root = $(id); root.innerHTML = '';
    values.forEach(v => {
      const bar = document.createElement('span'); bar.className='spark-bar';
      const pct = v ? clamp(v/max, .08, 1) : .06;
      bar.style.height = `${pct*100}%`;
      bar.style.background = v ? statusColor((v-1)/(max-1)) : 'rgba(255,255,255,.09)';
      root.appendChild(bar);
    });
  }

  function setupRatings() {
    $$('.rating-row').forEach(row => {
      const name = row.dataset.rating;
      row.innerHTML='';
      for (let i=1;i<=5;i++) {
        const btn=document.createElement('button'); btn.type='button'; btn.className='rating-button'; btn.textContent=String(i); btn.dataset.value=String(i);
        btn.addEventListener('click', () => setRating(name,i)); row.appendChild(btn);
      }
    });
  }
  function setRating(name, value) {
    const input=$(name); if (!input) return; input.value = value ? String(value) : '';
    const row=document.querySelector(`.rating-row[data-rating="${name}"]`);
    if (row) $$('.rating-button', row).forEach(b => b.classList.toggle('selected', Number(b.dataset.value)===Number(value)));
  }

  function switchView(view) {
    activeView=view;
    $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.navTarget===view));
    window.scrollTo({top:0,behavior:'smooth'});
    if (view==='home') renderDashboard();
    if (view==='stats') renderStats();
    if (view==='settings') fillSettings();
  }

  function switchCheckin(mode) {
    activeCheckin=mode;
    $('morningTab').classList.toggle('active',mode==='morning');
    $('eveningTab').classList.toggle('active',mode==='evening');
    $('morningTab').setAttribute('aria-selected', String(mode==='morning'));
    $('eveningTab').setAttribute('aria-selected', String(mode==='evening'));
    $('morningForm').classList.toggle('active',mode==='morning');
    $('eveningForm').classList.toggle('active',mode==='evening');
    fillFormsForDate();
  }

  function fillFormsForDate() {
    const date = selectedDateISO();
    const e = getEntry(date) || normalizeEntry(date,{date,morning:{},evening:{}});
    const m=e.morning, v=e.evening;
    $('bedTime').value=m.bedTime||''; $('wakeTime').value=m.wakeTime||''; $('nightQuality').value=m.nightQuality||''; setRating('morningEnergy',m.morningEnergy||0);
    $('win1').value=m.dailyWins[0]||''; $('win2').value=m.dailyWins[1]||''; $('win3').value=m.dailyWins[2]||''; $('focusPlan').value=String(m.focusPlan||0); $('ifThen').value=m.ifThen||'';
    $$('#blockerChips input').forEach(i=>i.checked=m.blockers.includes(i.value));

    $$('input[name="training"]').forEach(i=>i.checked=i.value===v.training);
    $('proteinBreakfast').value=v.proteinBreakfast||''; $('proteinLunch').value=v.proteinLunch||''; $('proteinDinner').value=v.proteinDinner||''; $('proteinOther').value=v.proteinOther||'';
    $('smallGlasses').value=v.smallGlasses||0; $('largeGlasses').value=v.largeGlasses||0;
    $('focusMinutes').value=String(v.focusMinutes||0); $('futureMinutes').value=String(v.futureMinutes||0); setRating('stress',v.stress||0); setRating('mood',v.mood||0);
    $('outdoorMinutes').value=String(v.outdoorMinutes||0); $('qualityTime').checked=Boolean(v.qualityTime);
    $$('#supplementChips input').forEach(i=>i.checked=v.supplements.includes(i.value));
    $('caffeineDrinks').value=v.caffeineDrinks||0; $('phoneDistracted').checked=Boolean(v.phoneDistracted); $('eveningNote').value=v.note||'';
    renderWinsReview(m.dailyWins,v.winStatuses);
    updateLiveTotals();
    $('morningSaved').textContent=''; $('eveningSaved').textContent='';
  }

  function renderWinsReview(wins, statuses) {
    const root=$('winsReview'); root.innerHTML='';
    const valid=wins.map((w,i)=>({w:(w||'').trim(),i})).filter(x=>x.w);
    if (!valid.length) { root.innerHTML='<p class="hint">Morgens noch keine Wins eingetragen.</p>'; return; }
    valid.forEach(({w,i}) => {
      const label=document.createElement('label'); label.className='win-review-row'; label.innerHTML=`<input type="checkbox" data-win-index="${i}" ${statuses[i]?'checked':''}><span></span>`; label.querySelector('span').textContent=w; root.appendChild(label);
    });
  }

  function collectMorning() {
    return {
      savedAt:new Date().toISOString(), entryDate:selectedDateISO(), bedTime:$('bedTime').value, wakeTime:$('wakeTime').value, nightQuality:$('nightQuality').value,
      morningEnergy:Number($('morningEnergy').value)||0,
      dailyWins:[$('win1').value.trim(),$('win2').value.trim(),$('win3').value.trim()],
      focusPlan:Number($('focusPlan').value)||0,
      blockers:$$('#blockerChips input:checked').map(i=>i.value), ifThen:$('ifThen').value.trim()
    };
  }
  function collectEvening(existing) {
    const statuses=(existing.morning.dailyWins||[]).map((_,i)=>Boolean(document.querySelector(`[data-win-index="${i}"]`)?.checked));
    return {
      savedAt:new Date().toISOString(), entryDate:selectedDateISO(), training:document.querySelector('input[name="training"]:checked')?.value||'',
      proteinBreakfast:numOrZero($('proteinBreakfast').value), proteinLunch:numOrZero($('proteinLunch').value), proteinDinner:numOrZero($('proteinDinner').value), proteinOther:numOrZero($('proteinOther').value), legacyProteinLevel:existing.evening.legacyProteinLevel ?? null,
      smallGlasses:numOrZero($('smallGlasses').value), largeGlasses:numOrZero($('largeGlasses').value), legacyWaterLevel:existing.evening.legacyWaterLevel ?? null,
      focusMinutes:numOrZero($('focusMinutes').value), futureMinutes:numOrZero($('futureMinutes').value), winStatuses:statuses,
      stress:Number($('stress').value)||0, mood:Number($('mood').value)||0, outdoorMinutes:numOrZero($('outdoorMinutes').value), qualityTime:$('qualityTime').checked,
      people:existing.evening.people||[], supplements:$$('#supplementChips input:checked').map(i=>i.value), caffeineDrinks:numOrZero($('caffeineDrinks').value), phoneDistracted:$('phoneDistracted').checked, note:$('eveningNote').value.trim()
    };
  }

  function updateLiveTotals() {
    const p=sum(['proteinBreakfast','proteinLunch','proteinDinner','proteinOther'].map(id=>numOrZero($(id).value)));
    $('proteinTotalLive').textContent=`${p} g`;
    const pr=clamp(p/state.settings.targetProtein,0,1); $('proteinBarLive').style.width=`${pr*100}%`; $('proteinBarLive').style.background=statusColor(pr);
    const w=numOrZero($('smallGlasses').value)*state.settings.smallGlassMl + numOrZero($('largeGlasses').value)*state.settings.largeGlassMl;
    $('waterTotalLive').textContent=`${(w/1000).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} L`;
    const wr=clamp(w/state.settings.targetWater,0,1); $('waterBarLive').style.width=`${wr*100}%`; $('waterBarLive').style.background=statusColor(wr);
    $('smallGlassLabel').textContent=`${state.settings.smallGlassMl} ml`; $('largeGlassLabel').textContent=`${state.settings.largeGlassMl} ml`;
  }

  function addProtein(amount) {
    const el=$('proteinOther'); el.value=String(numOrZero(el.value)+Number(amount)); updateLiveTotals();
  }

  function fillSettings() {
    Object.keys(DEFAULT_SETTINGS).forEach(k => { if ($(k)) $(k).value=state.settings[k]; });
  }
  function collectSettings() {
    const s={}; Object.keys(DEFAULT_SETTINGS).forEach(k=>s[k]=Number($(k).value)||DEFAULT_SETTINGS[k]);
    s.targetGym=clamp(s.targetGym,1,7); s.targetHome=clamp(s.targetHome,0,7); s.targetProtein=clamp(s.targetProtein,50,400); s.targetWater=clamp(s.targetWater,500,8000); s.targetSleep=clamp(s.targetSleep,240,720);
    s.targetFocusBlocks=clamp(s.targetFocusBlocks,1,14); s.targetFutureBlocks=clamp(s.targetFutureBlocks,1,14); s.focusBlockMinutes=clamp(s.focusBlockMinutes,15,180); s.futureBlockMinutes=clamp(s.futureBlockMinutes,15,180); s.smallGlassMl=clamp(s.smallGlassMl,50,1500); s.largeGlassMl=clamp(s.largeGlassMl,50,2000);
    return s;
  }

  function renderStats() {
    const today=new Date(); const currentStart=weekStart(today); const weeks=[];
    for(let i=3;i>=0;i--) weeks.push(addDays(currentStart,-7*i));
    const metricDefs=[
      {key:'gym',label:'Gym',value:(entries)=>entries.filter(e=>e.evening.training==='gym').length,target:()=>state.settings.targetGym},
      {key:'protein',label:'Protein-Tage',value:(entries)=>entries.filter(e=>proteinTotal(e.evening)>=state.settings.targetProtein).length,target:()=>7},
      {key:'water',label:'Wasser-Tage',value:(entries)=>entries.filter(e=>waterTotal(e.evening)>=state.settings.targetWater).length,target:()=>7},
      {key:'focus',label:'Fokusblöcke',value:(entries)=>Math.floor(sum(entries.map(e=>e.evening.focusMinutes))/state.settings.focusBlockMinutes),target:()=>state.settings.targetFocusBlocks},
      {key:'future',label:'Zukunftsblöcke',value:(entries)=>Math.floor(sum(entries.map(e=>e.evening.futureMinutes))/state.settings.futureBlockMinutes),target:()=>state.settings.targetFutureBlocks}
    ];
    const root=$('trendCards'); root.innerHTML='';
    metricDefs.forEach(def=>{
      const vals=weeks.map(ws=>{ const entries=dateRange(ws,7).map(d=>getEntry(localISO(d))).filter(Boolean); return def.value(entries); });
      const card=document.createElement('article'); card.className='trend-card';
      const latest=vals[3], prev=vals[2];
      card.innerHTML=`<div class="trend-card-head"><strong>${def.label}</strong><span>${latest}${latest>prev?' ↑':latest<prev?' ↓':' →'}</span></div><div class="week-bars"></div>`;
      const bars=card.querySelector('.week-bars');
      vals.forEach((v,i)=>{ const ratio=clamp(v/def.target(),0,1); const wrap=document.createElement('div'); wrap.className='week-bar-wrap'; const bar=document.createElement('div'); bar.className='week-bar'; bar.style.height=`${Math.max(5,ratio*72)}px`; bar.style.background=statusColor(ratio); const lab=document.createElement('small'); lab.textContent=i===3?'Diese':`-${3-i}W`; wrap.append(bar,lab); bars.appendChild(wrap); });
      root.appendChild(card);
    });
    renderInsight();
  }

  function renderInsight() {
    const entries=Object.values(state.entries).filter(e=>e && e.date).sort((a,b)=>a.date.localeCompare(b.date));
    if(entries.length<5){$('insightText').textContent='Noch zu wenig Daten für einen Trend. Nach einigen Tagen werden hier einfache Muster sichtbar.';return;}
    const moodWithOutdoor=entries.filter(e=>e.evening.mood&&e.evening.outdoorMinutes>=30).map(e=>e.evening.mood);
    const moodWithoutOutdoor=entries.filter(e=>e.evening.mood&&e.evening.outdoorMinutes<30).map(e=>e.evening.mood);
    const a=avg(moodWithOutdoor), b=avg(moodWithoutOutdoor);
    if(a!=null&&b!=null&&moodWithOutdoor.length>=2&&moodWithoutOutdoor.length>=2){ const diff=round1(a-b); $('insightText').textContent=diff>0?`An Tagen mit mindestens 30 Minuten draußen liegt dein Tagesgefühl bisher im Schnitt ${diff.toLocaleString('de-DE')} Punkte höher. Das ist nur ein Muster, keine Ursache.`:diff<0?`In deinen bisherigen Daten ist das Tagesgefühl an Tagen mit mehr Outdoor-Zeit nicht höher. Sammle weiter Daten, bevor du daraus etwas ableitest.`:'Bisher zeigt sich beim Tagesgefühl kein klarer Unterschied zwischen Tagen mit mehr oder weniger Outdoor-Zeit.'; return; }
    const completedWins=[]; entries.forEach(e=>e.morning.dailyWins.forEach((w,i)=>{if(w&&w.trim()) completedWins.push(Boolean(e.evening.winStatuses[i]));}));
    if(completedWins.length>=5){$('insightText').textContent=`Deine bisherige Daily-Win-Quote liegt bei ${Math.round(completedWins.filter(Boolean).length/completedWins.length*100)} %. Kontrollierbare, kleine Wins machen die Auswertung künftig aussagekräftiger.`;return;}
    $('insightText').textContent='Die Datenbasis wächst. Bleib bei wenigen, klaren Kennzahlen – dann werden die Trends nach einigen Wochen belastbarer.';
  }

  function exportBackup() {
    const payload={...state,version:5,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`philipp-os-backup-${localISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('Backup wurde exportiert.');
  }

  async function importBackup(file) {
    if(!file) return;
    try {
      const text=await file.text(); const parsed=JSON.parse(text); const next=normalizeState(parsed);
      if(!parsed.entries || typeof parsed.entries!=='object') throw new Error('Keine Einträge gefunden');
      state=next; saveState(); fillSettings(); fillFormsForDate(); renderDashboard(); renderStats();
      const count=Object.keys(state.entries).length;
      $('dataMessage').textContent=`${count} Einträge importiert. Ältere Protein-/Wasser-Stufen bleiben erhalten, zählen aber nicht als Gramm/Liter.`;
      toast('Backup erfolgreich importiert.');
    } catch(err) { console.error(err); $('dataMessage').textContent='Import fehlgeschlagen. Bitte eine gültige Philipp-OS-JSON-Datei wählen.'; toast('Import fehlgeschlagen.'); }
  }

  function clearData() {
    const ok=window.confirm('Wirklich alle lokalen Philipp-OS-Daten auf diesem Gerät löschen?'); if(!ok)return;
    localStorage.removeItem(STORAGE_KEY); LEGACY_KEYS.forEach(k=>localStorage.removeItem(k)); state=emptyState(); saveState(); fillSettings(); fillFormsForDate(); renderDashboard(); renderStats(); $('dataMessage').textContent='Lokale Daten wurden gelöscht.'; toast('Daten gelöscht.');
  }

  function toast(message) { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2200); }

  function bindEvents() {
    $$('[data-nav-target]').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.navTarget)));
    $('morningTab').addEventListener('click',()=>switchCheckin('morning')); $('eveningTab').addEventListener('click',()=>switchCheckin('evening'));
    $('entryDate').addEventListener('change',fillFormsForDate); $('jumpTodayBtn').addEventListener('click',()=>{ $('entryDate').value=localISO(); switchView('checkin'); fillFormsForDate(); });

    $('morningForm').addEventListener('submit',(ev)=>{ev.preventDefault(); const date=selectedDateISO(); const e=getEntry(date,true); e.morning=collectMorning(); e.evening.winStatuses=normalizeWinStatuses(e.evening.winStatuses,e.morning.dailyWins); saveState(); renderWinsReview(e.morning.dailyWins,e.evening.winStatuses); $('morningSaved').textContent='Gespeichert ✓'; toast('Morgen-Check-in gespeichert.'); renderDashboard();});
    $('eveningForm').addEventListener('submit',(ev)=>{ev.preventDefault(); const date=selectedDateISO(); const e=getEntry(date,true); e.evening=collectEvening(e); saveState(); $('eveningSaved').textContent='Gespeichert ✓'; toast('Abend-Check-in gespeichert.'); renderDashboard();});
    ['proteinBreakfast','proteinLunch','proteinDinner','proteinOther','smallGlasses','largeGlasses'].forEach(id=>$(id).addEventListener('input',updateLiveTotals));
    $$('[data-protein-add]').forEach(b=>b.addEventListener('click',()=>addProtein(b.dataset.proteinAdd)));
    $('settingsForm').addEventListener('submit',(ev)=>{ev.preventDefault(); state.settings=collectSettings(); saveState(); updateLiveTotals(); renderDashboard(); $('settingsSaved').textContent='Gespeichert ✓'; toast('Ziele aktualisiert.');});
    $('exportBtn').addEventListener('click',exportBackup); $('importInput').addEventListener('change',(ev)=>importBackup(ev.target.files?.[0])); $('clearBtn').addEventListener('click',clearData);
    $('themeGlowBtn').addEventListener('click',()=>document.body.classList.toggle('glow'));
  }

  function registerServiceWorker() {
    if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service worker registration failed',err));
  }

  function init() {
    setupRatings();
    $('entryDate').value=localISO();
    bindEvents(); fillSettings(); fillFormsForDate(); renderDashboard(); renderStats(); registerServiceWorker();
    window.PhilippOS={getState:()=>JSON.parse(JSON.stringify(state)),normalizeState,sleepMinutes,proteinTotal,waterTotal};
  }

  document.addEventListener('DOMContentLoaded',init);
})();
