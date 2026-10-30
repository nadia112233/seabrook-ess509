import {LOCATIONS, ACTIONS, validArrangement, placeAction, totalReduction, restoreState, cleanNotes} from './core.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => {
  const paths = {
    sound:'<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
    print:'<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.arrow}</svg>`;
};
const STORAGE = 'seabrook.sample.v1';
let data, state, route='explore', feature='all', selected=null, comparison=false, storageOK=true, statusTimer, speechText='';
let lastRoute='';
const anchors = {
  mall: {x:.24,y:.47}, suburbs:{x:.60,y:.18}, beach:{x:.83,y:.63}
};
const featureAnchors = {
  mall:[['mall-tables',.32,.47],['mall-drain',.28,.85],['mall-shops',.44,.29]],
  suburbs:[['suburbs-homes',.225,.52],['suburbs-kerb',.45,.73],['suburbs-drain',.13,.911]],
  beach:[['beach-entrance',.09,.46],['beach-sand',.55,.71],['beach-shore',.80,.40]]
};
const loc = id => data.locations.find(l => l.id===id);
const act = id => data.actions.find(a => a.id===id);
const list = a => `<ul>${a.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`;
const checked = x => x ? ' checked' : '';
const toggle = (id,label,value) => `<label class="toggle"><input type="checkbox" data-setting="${id}"${checked(value)}> ${esc(label)}</label>`;
const audio = (text,label='Read aloud') => `<div class="audio-tools"><button class="icon-button" data-speak="${esc(text)}">${icon('sound')} ${esc(label)}</button><button class="icon-button subtle" data-stop>${icon('stop')} Stop reading</button></div>`;

function announce(text) {
  clearTimeout(statusTimer); $('#status').textContent=text;
  statusTimer=setTimeout(()=>{$('#status').textContent='';},6500);
}
function persist() {
  try { localStorage.setItem(STORAGE,JSON.stringify(state)); }
  catch { storageOK=false; announce('This browser cannot save your work. Keep this page open or print your plans.'); }
}
function speak(text) {
  if (!('speechSynthesis' in window)) { announce(data.copy.feedback.audio_unavailable); return; }
  window.speechSynthesis.cancel();
  speechText=text;
  const utterance=new SpeechSynthesisUtterance(text); utterance.lang='en-AU';utterance.rate=.93;
  const voices=window.speechSynthesis.getVoices();
  const voice=voices.find(v=>v.lang==='en-AU') || voices.find(v=>v.lang.startsWith('en'));
  if(voice)utterance.voice=voice;
  utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))announce('Read-aloud could not start. The text is available, or someone can read with you.');};
  window.speechSynthesis.speak(utterance);
  announce('Reading aloud. Use Stop reading whenever you want.');
}
function stopSpeech(){if('speechSynthesis' in window)window.speechSynthesis.cancel();speechText='';}

function choose(title,body,options=[{value:'yes',label:'Continue',primary:true}]) {
  return new Promise(resolve=>{
    const dialog=$('#choice-dialog');$('#dialog-title').textContent=title;$('#dialog-body').textContent=body;
    $('#dialog-options').innerHTML=`<button value="cancel" autofocus>Keep as it is</button>`+options.map(o=>`<button value="${esc(o.value)}" class="${o.primary?'primary':''}">${esc(o.label)}</button>`).join('');
    const done=()=>{dialog.removeEventListener('close',done);resolve(dialog.returnValue || 'cancel');};
    dialog.addEventListener('close',done);dialog.returnValue='cancel';dialog.showModal();
  });
}

function renderToolbar() {
  $('#toolbar').innerHTML=`<div class="toolbar-group">${route!=='teacher'?toggle('keys','Show key points',state.keys):'<span class="toolbar-note">Worked examples for the teacher</span>'}<span class="toolbar-note">Read, listen and work at your own pace.</span></div><button class="icon-button" data-print>${icon('print')} Print ${route==='explore'?'locations':route==='plan'?'activity':'teacher answers'}</button>`;
}
function vocabulary() {
  return `<details class="vocabulary"><summary>Words you may want to check</summary><div class="vocab-grid">${data.copy.vocabulary.map(v=>`<p><strong>${esc(v.term)}</strong>${esc(v.definition)}</p>`).join('')}</div>${audio(data.copy.vocabulary.map(v=>`${v.term}. ${v.definition}`).join(' '),'Read vocabulary')}</details>`;
}
function strategy(guided=false) {
  const steps=guided ? data.support.guided_strip : data.support.strategy.map((label,i)=>({label,instruction:['Find useful information about each place.','Test actions, effects and possible limitations.','Choose a plan and connect your reasons to evidence.'][i]}));
  return `<div class="strategy" aria-label="Thinking strategy">${steps.map((s,i)=>`<div class="strategy-step"><span class="step-number" aria-hidden="true">${i+1}</span><div><strong>${esc(s.label)}</strong><p>${esc(s.instruction)}</p></div></div>`).join('')}</div>`;
}

function overview() {
  return `<div class="intro-row"><div><div class="intro-label">A place to explore</div><h2>Welcome to Seabrook.</h2><p>${esc(data.copy.welcome)}</p></div><span class="section-counter" aria-hidden="true">01</span></div>
  <div class="map-frame" id="overview-map"><img src="assets/map/seabrook-map.webp" width="1536" height="1024" alt="Illustrated coastal Seabrook: a shopping precinct on the left, suburbs inland at upper right, and a beach and ocean on the right. A narrow creek reaches the coast.">${data.locations.map(l=>`<button class="map-marker" style="left:${anchors[l.id].x*100}%;top:${anchors[l.id].y*100}%" data-location="${l.id}"><span class="marker-dot" aria-hidden="true"></span>${esc(l.name)} ${icon('arrow')}</button>`).join('')}<span class="water-label">Creek / waterway</span></div>
  <div class="map-caption"><div class="legend" aria-label="Map legend"><strong>Map key</strong><span><i class="marker-dot" aria-hidden="true"></i> Explore a location</span><span><i class="marker-dot water-dot" aria-hidden="true"></i> Waterway</span></div><span>Fictional setting · Illustration is not to scale</span></div>
  <p class="note">Choose a marker, or use the location cards below. Every location is also available as text and read-aloud.</p>
  <div class="location-grid">${data.locations.map(l=>`<button class="location-card" data-location="${l.id}"><img src="${l.closeup_image}" alt="" loading="lazy"><div class="card-copy"><h3>${esc(l.name)} ${icon('arrow')}</h3><p>${esc(l.overview)}</p></div></button>`).join('')}</div>
  ${strategy()}<div class="button-row"><a class="button-link" href="#plan">Ready to test some actions? ${icon('arrow')}</a></div>${vocabulary()}`;
}
function locationView() {
  const l=loc(state.location);const selectedFeature=l.features.find(f=>f.id===feature);
  let sections=selectedFeature ? [l.sections[selectedFeature.section_index]] : l.sections;
  const reading=state.keys && !selectedFeature ? list(l.key_points) : sections.map(s=>`<section class="text-section"><h4>${esc(s.heading)}</h4><p>${esc(s.text)}</p></section>`).join('');
  const text=state.keys && !selectedFeature ? l.key_points.join(' ') : sections.map(s=>s.heading+'. '+s.text).join(' ');
  const markers=featureAnchors[l.id].map(([id,x,y])=>{const f=l.features.find(f=>f.id===id);return `<button class="map-marker feature-marker" style="left:${Math.min(.83,Math.max(.17,x))*100}%;top:${Math.min(.85,y)*100}%" data-feature="${id}">${esc(f.label)}</button>`;}).join('');
  return `<div class="location-heading"><button class="icon-button" data-map>${icon('back')} Back to map</button><h2>${esc(l.name)}</h2></div><div class="location-detail"><div class="closeup"><div class="map-frame"><img src="${l.closeup_image}" alt="${esc(l.map_alt)}">${markers}</div><div class="map-caption">Enlarged from the Seabrook illustration. Select a labelled feature or read all the information.</div><div class="feature-list" aria-label="Location features">${l.features.map(f=>`<button data-feature="${f.id}" aria-pressed="${feature===f.id}">${esc(f.label)}</button>`).join('')}</div></div><article class="reading-panel" aria-label="${esc(l.name)} information"><div class="reading-head"><h3>${selectedFeature?esc(selectedFeature.label):state.keys?'Key points':'About this place'}</h3></div><p class="note">${esc(l.overview)}</p>${audio(text)}<div id="location-reading">${reading}</div><div class="button-row"><button class="small" data-feature="all">Read all location information</button>${state.keys?'<button class="small" data-full-text>More detail</button>':''}</div></article></div><div class="below-location"><div class="button-row">${data.locations.filter(x=>x.id!==l.id).map(x=>`<button class="small" data-location="${x.id}">${esc(x.name)} ${icon('arrow')}</button>`).join('')}</div><a href="#plan">Test your plan ${icon('arrow')}</a></div>${vocabulary()}`;
}

function effectTable(a,focus=state.focus) {
  return `<table class="effect-table"><caption>Fewer pieces · four-week simulation</caption><thead><tr>${LOCATIONS.map(l=>`<th scope="col" class="${l===focus?'focused':''}">${esc(loc(l).short_name)}</th>`).join('')}</tr></thead><tbody><tr>${LOCATIONS.map(l=>`<td class="${l===focus?'focused':''}">${a.effects[l]}</td>`).join('')}</tr></tbody></table>`;
}
function actionCard(a) {
  const used=LOCATIONS.find(l=>state.arr[l]===a.id);
  return `<article class="action-card ${selected===a.id?'selected':''} ${used?'used':''}" draggable="true" data-drag-action="${a.id}" aria-label="${esc(a.name)} action card"><span class="action-letter" aria-hidden="true">${a.letter}</span><img class="action-image" src="${a.icon_path}" alt="${esc(a.icon_alt)}" loading="lazy"><h3>${esc(a.name)}</h3><p class="summary">${esc(a.summary)}</p>${effectTable(a)}<p class="used-label">${used?'Currently at '+esc(loc(used).name):'Available for a location'}</p><details class="action-details"><summary>Expand details</summary>${state.keys?list(a.key_points):a.sections.map(s=>`<h4>${esc(s.heading)}</h4><p>${esc(s.text)}</p>`).join('')}${audio((state.keys?a.key_points:a.sections.map(s=>s.text)).join(' '),'Read action')}</details><div class="button-row"><button class="${selected===a.id?'primary':''}" data-select-action="${a.id}" aria-pressed="${selected===a.id}">${selected===a.id?'Selected':'Choose action'}</button><button data-read-action="${a.id}" aria-label="Read ${esc(a.name)} aloud">${icon('sound')} Read</button></div></article>`;
}
function slot(l) {
  const a=state.arr[l]?act(state.arr[l]):null;
  return `<section class="slot ${a?'occupied':''}" data-drop-location="${l}" tabindex="-1" aria-label="Action at ${esc(loc(l).name)}"><div class="slot-location"><h3>${esc(loc(l).name)}</h3><span>${a?'Assigned':'Choose an action'}</span></div>${a?`<div class="slot-value"><img src="${a.icon_path}" alt=""><strong>${esc(a.name)}</strong></div><p>${a.effects[l]} pieces reduced in the simulation</p>`:'<p>Select an action above, then place it here. You can also drag a card into this box.</p>'}<div class="button-row"><button data-place="${l}" ${!selected?'disabled':''}>${a?'Place selected action here':'Place selected action here'}</button>${a?`<button class="subtle" data-remove="${l}" aria-label="Remove action from ${esc(loc(l).name)}">Remove</button>`:''}</div></section>`;
}
function numberPanel(arr=state.arr) {
  const complete=validArrangement(arr,true),sum=totalReduction(arr,data.actions);
  return `<section class="number-panel" aria-label="Calculation support"><div><h3>${complete?'Add the three selected effects':'So far — this arrangement is incomplete'}</h3><div class="expression">${LOCATIONS.map((l,i)=>`${i?'<span aria-hidden="true">+</span>':''}<span class="number-tile"><small>${esc(loc(l).short_name)}</small>${arr[l]?act(arr[l]).effects[l]:'—'}</span>`).join('')}</div></div><div><div class="total-value">${sum}</div><p class="note">${complete?'pieces reduced':'pieces reduced so far'}</p>${complete?`<details><summary>How many pieces remain?</summary><p>300 − ${sum} = ${300-sum} pieces remain in this simulation.</p></details>`:''}</div></section>`;
}
function helpPanel() {
  return `${strategy(true)}<section class="prompts"><div class="prompts-grid"><div><h3>Think about a limitation</h3>${list(data.support.reasoning_prompts)}</div><div><h3>Build your explanation</h3>${list(data.support.frames.slice(0,4))}</div></div>${audio(data.support.reasoning_prompts.join(' '),'Read thinking prompts')}<details><summary>Go a little deeper</summary>${list(data.support.depth_prompts)}</details></section>`;
}
function notes() {
  return `<details class="notes-area" ${state.help?'open':''}><summary>Group thinking — optional notes</summary><p class="note">Keep a clue and a possible limitation beside each choice. You can discuss these aloud instead.</p><div class="note-grid">${LOCATIONS.map(l=>`<div class="note-cell"><h4>${esc(loc(l).name)}</h4><label for="reason-${l}">Why might this action fit?</label><textarea id="reason-${l}" data-note="reason" data-note-location="${l}" maxlength="1500">${esc(state.notes[l].reason)}</textarea><label for="limitation-${l}">What might it miss or depend on?</label><textarea id="limitation-${l}" data-note="limitation" data-note-location="${l}" maxlength="1500">${esc(state.notes[l].limitation)}</textarea></div>`).join('')}</div></details>`;
}
function focusInfo() {
  if(!state.focus)return '';
  const l=loc(state.focus);
  return `<section class="focus-info"><h3>One location at a time: ${esc(l.name)}</h3>${list(l.key_points)}${audio(l.key_points.join(' '),'Read location clues')}<div class="focus-selects">${[0,1].map(i=>`<label>Candidate action ${i+1}<select data-candidate="${i}">${data.actions.map(a=>`<option value="${a.id}" ${state.candidates[i]===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`).join('')}</div><p class="note">The highlighted column below is for ${esc(l.name)}. Turn off focus mode to restore all four cards.</p></section>`;
}
function savedCard(plan,i,other) {
  if(!plan)return `<div class="saved-plan empty-state"><h3>Plan ${i+1}</h3><p>Save a complete arrangement here when you are ready.</p></div>`;
  return `<article class="saved-plan"><div class="plan-title"><h3>Plan ${i+1}</h3><button class="small" data-load-plan="${i}">Keep working on this plan</button></div><table><caption class="sr-only">Saved Plan ${i+1}</caption><thead><tr><th scope="col">Location</th><th scope="col">Action</th>${state.numbers?'<th scope="col">Pieces</th>':''}</tr></thead><tbody>${LOCATIONS.map(l=>`<tr class="${other&&plan.arr[l]!==other.arr[l]?'changed-row':''}"><th scope="row">${esc(loc(l).short_name)}</th><td>${esc(act(plan.arr[l]).name)}${other&&plan.arr[l]!==other.arr[l]?'<span class="difference-tag">Different choice</span>':''}</td>${state.numbers?`<td>${act(plan.arr[l]).effects[l]}</td>`:''}</tr>`).join('')}</tbody></table>${state.numbers?`<p class="saved-total"><span>Total reduction</span><strong>${totalReduction(plan.arr,data.actions)} pieces</strong></p>`:''}${LOCATIONS.some(l=>plan.notes[l].reason||plan.notes[l].limitation)?`<details><summary>Saved group thinking</summary>${LOCATIONS.map(l=>`<h4>${esc(loc(l).name)}</h4>${plan.notes[l].reason?`<p>${esc(plan.notes[l].reason)}</p>`:''}${plan.notes[l].limitation?`<p>Possible limitation: ${esc(plan.notes[l].limitation)}</p>`:''}`).join('')}</details>`:''}</article>`;
}
function savedSection() {
  if(!comparison && !state.saved.some(Boolean))return '';
  return `<section class="saved-overview" id="saved-comparison"><h3>Your saved plans</h3><div class="saved-grid">${savedCard(state.saved[0],0,state.saved[1])}${savedCard(state.saved[1],1,state.saved[0])}</div>${state.saved.every(Boolean)?`<div class="prompts"><h3>Compare your reasons</h3>${list(data.support.comparison_prompts)}${audio(data.support.comparison_prompts.join(' '),'Read comparison prompts')}</div>`:''}<p class="note">${storageOK?esc(data.copy.feedback.storage_note):'Browser saving is unavailable. Print your plans before closing this page.'}</p></section>`;
}
function planView() {
  const cards=state.focus?data.actions.filter(a=>state.candidates.includes(a.id)):data.actions;
  return `<div class="intro-row"><div><div class="intro-label">A choice to think through</div><h2>Test your plan.</h2><p>${esc(data.copy.planning_intro)}</p></div><span class="section-counter" aria-hidden="true">02</span></div><div class="rule-strip"><div class="rules"><span><b>1</b> action per location</span><span><b>1</b> use per action</span><span><b>1</b> action left unused</span></div><span class="simulation-tag">Four-week classroom simulation</span></div>
  <details class="simulation-explanation"><summary>What do the numbers mean?</summary><p>${esc(data.copy.simulation_explanation)}</p><p>${esc(data.copy.counting_note)}</p><p>${esc(data.copy.allocation_rule_explanation)}</p>${audio(data.copy.simulation_explanation+' '+data.copy.counting_note)}</details>
  <div class="support-tray">${toggle('numbers','Help with numbers',state.numbers)}${toggle('help','Help me compare',state.help)}<label class="toggle" for="focus-location">Focus on one location <select id="focus-location" data-focus><option value="">All locations</option>${LOCATIONS.map(l=>`<option value="${l}" ${state.focus===l?'selected':''}>${esc(loc(l).name)}</option>`).join('')}</select></label></div>${focusInfo()}<div class="action-grid">${cards.map(actionCard).join('')}</div><div class="section-heading"><h3>Your working arrangement</h3><p>${selected?`Selected: ${esc(act(selected).name)}. Choose a destination below.`:'Choose an action, then a location. Dragging is optional.'}</p></div><div class="allocation-grid">${LOCATIONS.map(slot).join('')}</div>${state.numbers?numberPanel():''}${state.help?helpPanel():''}${notes()}<div class="saved-controls"><button class="primary" data-save-plan="0" ${!validArrangement(state.arr,true)?'disabled':''}>${state.saved[0]?'Replace saved Plan 1':'Save as Plan 1'}</button><button data-save-plan="1" ${!validArrangement(state.arr,true)?'disabled':''}>${state.saved[1]?'Replace saved Plan 2':'Save as Plan 2'}</button><button data-show-comparison ${!state.saved.some(Boolean)?'disabled':''}>Compare saved plans</button><button class="subtle danger" data-reset>Clear this arrangement</button><button class="subtle" data-new-group>Start a new group</button></div><p class="note">${esc(data.copy.judgment_note)} ${esc(data.copy.handoff_to_individual_task)}</p>${savedSection()}${vocabulary()}`;
}
function teacherView() {
  return `<div class="intro-row"><div class="teacher-intro"><div class="intro-label">Reasoning behind the choices</div><h2>Answers for the teacher.</h2><p>${esc(data.teacher.intro)}</p></div><span class="section-counter" aria-hidden="true">03</span></div><span class="simulation-tag">Invented classroom data</span>${data.teacher.plans.map((plan,i)=>{
    const arr=Object.fromEntries(plan.allocations.map(x=>[x.location,x.action]));const total=totalReduction(arr,data.actions);
    return `<article class="teacher-plan"><div class="teacher-plan-top"><div><p class="eyebrow">Worked recommendation ${i+1}</p><h3>${esc(plan.heading.split(' — ')[1])}</h3></div><div class="teacher-total"><strong>${total}</strong><span>pieces reduced · ${300-total} remain</span></div></div><table class="teacher-table"><caption class="sr-only">Allocation for worked recommendation ${i+1}</caption><thead><tr><th scope="col">Location</th><th scope="col">Action</th><th scope="col">Reduction</th></tr></thead><tbody>${plan.allocations.map(row=>`<tr><th scope="row">${esc(loc(row.location).name)}</th><td>${esc(act(row.action).name)}</td><td>${act(row.action).effects[row.location]}</td></tr>`).join('')}</tbody></table><p class="note">${plan.allocations.map(row=>act(row.action).effects[row.location]).join(' + ')} = ${total} pieces reduced. Unused action: <strong>${esc(act(plan.unused_action).name)}</strong>.</p><p class="teacher-summary">${esc(plan.summary)}</p><div class="reason-grid">${plan.allocations.map(row=>`<section><h4>${esc(loc(row.location).name)}</h4><p>${esc(row.reason)}</p><p class="limitation"><strong>Limitation:</strong> ${esc(row.limitation)}</p></section>`).join('')}</div>${audio(plan.summary+' '+plan.allocations.map(row=>loc(row.location).name+'. '+row.reason+' Limitation: '+row.limitation).join(' '),'Read this explanation')}</article>`;
  }).join('')}<section class="teacher-note"><h3>Look for the reasoning</h3><p>${esc(data.teacher.comparison_note)}</p><p>${esc(data.teacher.simulation_note)}</p></section>`;
}

function render({focusMain=false}={}) {
  document.querySelectorAll('[data-route]').forEach(a=>{if(a.dataset.route===route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  renderToolbar();$('#main').innerHTML=route==='teacher'?teacherView():route==='plan'?planView():state.location?locationView():overview();
  if(focusMain)$('#main').focus({preventScroll:true});
}
function changeRoute() {
  route=['explore','plan','teacher'].includes(location.hash.slice(1))?location.hash.slice(1):'explore';
  if(route!==lastRoute){stopSpeech();selected=null;lastRoute=route;render({focusMain:true});window.scrollTo(0,0);}else render();
}

async function assign(action,location) {
  if(!ACTIONS.includes(action)||!LOCATIONS.includes(location))return;
  const source=LOCATIONS.find(l=>state.arr[l]===action), displaced=state.arr[location];
  if(source===location){announce(`${act(action).name} is already at ${loc(location).name}.`);return;}
  let mode='replace';
  if(displaced){
    const options=source?[{value:'swap',label:'Swap the two actions',primary:true},{value:'replace',label:'Replace and leave the other location empty'}]:[{value:'replace',label:'Replace this action',primary:true}];
    const value=await choose('Change this allocation?',`${loc(location).name} currently has ${act(displaced).name}.${source?' '+act(action).name+' is at '+loc(source).name+'.':''} Choose how to update your plan.`,options);
    if(value==='cancel')return;mode=value;
  }else if(source){
    if(await choose('Move this action?',`${act(action).name} will move from ${loc(source).name} to ${loc(location).name}. ${loc(source).name} will be empty.`,[{value:'move',label:'Move action',primary:true}])!=='move')return;
  }
  state.arr=placeAction(state.arr,action,location,mode);selected=null;persist();render();document.querySelector(`[data-drop-location="${location}"]`)?.focus({preventScroll:true});announce(`${act(action).name} is now at ${loc(location).name}.`);
}

document.addEventListener('click',async e=>{
  if(e.target.closest('.skip-link')){e.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}
  const b=e.target.closest('button');if(!b||!data||b.disabled)return;
  if(b.hasAttribute('data-speak')){speak(b.dataset.speak);return;}
  if(b.hasAttribute('data-stop')){stopSpeech();announce('Reading stopped.');return;}
  if(b.hasAttribute('data-print')){preparePrint();window.print();return;}
  if(b.hasAttribute('data-location')){state.location=b.dataset.location;feature='all';persist();stopSpeech();render({focusMain:true});window.scrollTo(0,0);return;}
  if(b.hasAttribute('data-map')){state.location=null;feature='all';persist();stopSpeech();render({focusMain:true});return;}
  if(b.hasAttribute('data-feature')){feature=b.dataset.feature;stopSpeech();render();$('#location-reading')?.scrollIntoView({block:'nearest'});return;}
  if(b.hasAttribute('data-full-text')){state.keys=false;persist();render();return;}
  if(b.hasAttribute('data-read-action')){const a=act(b.dataset.readAction);speak(a.name+'. '+(state.keys?a.key_points:a.sections.map(s=>s.text)).join(' '));return;}
  if(b.hasAttribute('data-select-action')){selected=selected===b.dataset.selectAction?null:b.dataset.selectAction;const selectedId=selected;render();document.querySelector(`[data-select-action="${b.dataset.selectAction}"]`)?.focus({preventScroll:true});announce(selectedId?`${act(selectedId).name} selected. Choose a location below.`:'Selection cleared.');return;}
  if(b.hasAttribute('data-place')){if(selected)await assign(selected,b.dataset.place);return;}
  if(b.hasAttribute('data-remove')){const l=b.dataset.remove;state.arr[l]=null;persist();render();document.querySelector(`[data-drop-location="${l}"]`)?.focus({preventScroll:true});announce(`Action removed from ${loc(l).name}.`);return;}
  if(b.hasAttribute('data-save-plan')){
    const i=Number(b.dataset.savePlan);if(!validArrangement(state.arr,true))return;
    if(state.saved[i]&&await choose(`Replace Plan ${i+1}?`,'This replaces the saved snapshot and its group notes. The other saved plan stays.',[{value:'replace',label:'Replace saved plan',primary:true}])!=='replace')return;
    state.saved[i]={arr:{...state.arr},notes:cleanNotes(state.notes)};comparison=true;persist();render();announce(`Plan ${i+1} saved for comparison.`);return;
  }
  if(b.hasAttribute('data-show-comparison')){comparison=true;render();$('#saved-comparison')?.scrollIntoView({block:'start'});return;}
  if(b.hasAttribute('data-load-plan')){
    const i=Number(b.dataset.loadPlan),plan=state.saved[i];if(!plan)return;
    if(await choose(`Work on Plan ${i+1}?`,'This replaces the current working arrangement and notes. Both saved snapshots stay unchanged.',[{value:'load',label:'Load this plan',primary:true}])!=='load')return;
    state.arr={...plan.arr};state.notes=cleanNotes(plan.notes);selected=null;persist();render();announce(`Plan ${i+1} loaded. Your saved snapshot is unchanged.`);return;
  }
  if(b.hasAttribute('data-new-group')){
    if(await choose('Start a new group?','This clears the working arrangement, group notes and both saved plans from this browser. Print any work you want to keep first.',[{value:'clear-all',label:'Clear group work'}])!=='clear-all')return;
    state.arr={mall:null,beach:null,suburbs:null};state.notes=cleanNotes();state.saved=[null,null];selected=null;comparison=false;persist();render({focusMain:true});announce('Ready for a new group. All group work cleared.');return;
  }
  if(b.hasAttribute('data-reset')){
    if(await choose('Clear this working arrangement?','The three location boxes and current group notes will be cleared. Your two saved plans will stay.',[{value:'clear',label:'Clear working arrangement'}])!=='clear')return;
    state.arr={mall:null,beach:null,suburbs:null};state.notes=cleanNotes();selected=null;persist();render();announce('Working arrangement cleared. Saved plans kept.');
  }
});

document.addEventListener('change',e=>{
  const el=e.target;if(!data)return;
  const restoreControl=()=>{const selector=el.dataset.setting?`[data-setting="${el.dataset.setting}"]`:el.hasAttribute('data-focus')?'[data-focus]':`[data-candidate="${el.dataset.candidate}"]`;document.querySelector(selector)?.focus({preventScroll:true});};
  if(el.dataset.setting){state[el.dataset.setting]=el.checked;persist();stopSpeech();render();restoreControl();return;}
  if(el.hasAttribute('data-focus')){state.focus=el.value;persist();render();restoreControl();return;}
  if(el.hasAttribute('data-candidate')){
    const i=Number(el.dataset.candidate),other=1-i,prior=state.candidates[i];
    if(state.candidates[other]===el.value)state.candidates[other]=prior;
    state.candidates[i]=el.value;persist();render();restoreControl();return;
  }
});
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.note){state.notes[el.dataset.noteLocation][el.dataset.note]=el.value.slice(0,1500);persist();}});
document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-drag-action]');if(!card)return;e.dataTransfer.setData('text/plain',card.dataset.dragAction);e.dataTransfer.effectAllowed='move';});
document.addEventListener('dragover',e=>{const slot=e.target.closest('[data-drop-location]');if(!slot)return;e.preventDefault();e.dataTransfer.dropEffect='move';slot.classList.add('drag-over');});
document.addEventListener('dragleave',e=>{const slot=e.target.closest('[data-drop-location]');if(slot&&!slot.contains(e.relatedTarget))slot.classList.remove('drag-over');});
document.addEventListener('drop',e=>{const slot=e.target.closest('[data-drop-location]');if(!slot)return;e.preventDefault();slot.classList.remove('drag-over');assign(e.dataTransfer.getData('text/plain'),slot.dataset.dropLocation);});
document.addEventListener('dragend',()=>document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over')));
window.addEventListener('hashchange',changeRoute);
window.addEventListener('pagehide',stopSpeech);

function printTable(arr){return `<table><thead><tr><th>Location</th><th>Action</th><th>Reduction</th></tr></thead><tbody>${LOCATIONS.map(l=>`<tr><th>${esc(loc(l).name)}</th><td>${arr[l]?esc(act(arr[l]).name):'Choose an action'}</td><td>${arr[l]?act(arr[l]).effects[l]:'—'}</td></tr>`).join('')}</tbody></table><p>${validArrangement(arr,true)?'Total reduction':'Partial reduction'}: ${totalReduction(arr,data.actions)} pieces.</p>`;}
function preparePrint(){
  if(!data)return;
  let html='<h1>Nadia Faisal ESS509 Sample Resource</h1>';
  if(route==='explore'){
    html+=`<h2>Explore Seabrook</h2><img class="print-map" src="assets/map/seabrook-map.webp" alt="Seabrook map"><p>Shopping mall: left. Suburbs: upper right. Beach: right. Waterway: narrow creek at the far end of the beach. Fictional illustration, not to scale.</p>`;
    for(const l of data.locations)html+=`<section class="print-location"><h2>${esc(l.name)}</h2><img src="${l.closeup_image}" alt="${esc(l.map_alt)}">${state.keys?list(l.key_points):l.sections.map(s=>`<h3>${esc(s.heading)}</h3><p>${esc(s.text)}</p>`).join('')}</section>`;
  }else if(route==='plan'){
    html+=`<h2>Test your plan</h2><p>${esc(data.copy.planning_intro)}</p><p>${esc(data.copy.simulation_explanation)}</p>`;
    for(const a of data.actions)html+=`<section class="print-card"><img src="${a.icon_path}" alt=""><h3>${a.letter}. ${esc(a.name)}</h3>${state.keys?list(a.key_points):a.sections.map(s=>`<p>${esc(s.text)}</p>`).join('')}${effectTable(a,'')}</section>`;
    html+='<h2>Allocate one action to each location</h2>'+LOCATIONS.map(l=>`<div class="print-box">${esc(loc(l).name)}:</div>`).join('')+'<h3>Find a clue → Match an action → Explain</h3>'+list(data.support.reasoning_prompts)+'<table><tr><th>Location / action</th><th>Effect</th><th>Why it fits</th><th>What it may miss / depend on</th></tr>'+LOCATIONS.map(l=>`<tr><td>${esc(loc(l).name)}</td><td></td><td></td><td></td></tr>`).join('')+'</table><h2>Current working arrangement</h2>'+printTable(state.arr);
    state.saved.forEach((p,i)=>{if(p)html+=`<h2>Saved Plan ${i+1}</h2>${printTable(p.arr)}${LOCATIONS.map(l=>`<p><strong>${esc(loc(l).name)}:</strong> ${esc(p.notes[l].reason)} ${p.notes[l].limitation?'Possible limitation: '+esc(p.notes[l].limitation):''}</p>`).join('')}`;});
    html+='<p>Your teacher provides the separate individual recommendation task.</p>';
  }else{
    html+='<h2>Answers for the teacher</h2><p>'+esc(data.teacher.intro)+'</p>';
    for(const plan of data.teacher.plans){const arr=Object.fromEntries(plan.allocations.map(x=>[x.location,x.action]));html+=`<section class="print-answer"><h2>${esc(plan.heading)}</h2>${printTable(arr)}<p>${esc(plan.summary)}</p>${plan.allocations.map(row=>`<h3>${esc(loc(row.location).name)}</h3><p>${esc(row.reason)}</p><p><strong>Limitation:</strong> ${esc(row.limitation)}</p>`).join('')}</section>`;}
  }
  html+='<p class="print-note">Classroom simulation: all numbers and Seabrook descriptions are invented. General mechanisms are informed by NSW litter prevention and stormwater guidance. Illustrations generated for this resource.</p>';
  $('#print-pack').innerHTML=html;
}
window.addEventListener('beforeprint',preparePrint);

async function init(){
  try{
    const names=['locations','actions','site-copy','support-prompts','simulation','teacher-answers'];
    const values=await Promise.all(names.map(async n=>{const r=await fetch(`content/${n}.json`);if(!r.ok)throw Error('Could not load '+n);return r.json();}));
    data={locations:values[0],actions:values[1],copy:values[2],support:values[3],simulation:values[4],teacher:values[5]};
    let raw;try{raw=localStorage.getItem(STORAGE);}catch{storageOK=false;}
    state=restoreState(raw);changeRoute();
    if(!storageOK)announce('Browser saving is unavailable. Keep the page open or print your plans.');
  }catch(error){$('#main').innerHTML='<div class="empty-state"><h2>Seabrook could not open.</h2><p>Please reload the page to try again. If you opened a downloaded file directly, serve the website through its local or hosted URL.</p><button onclick="location.reload()">Reload</button></div>';console.error(error);}
}
init();
