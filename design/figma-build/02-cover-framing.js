const AF=Object.getPrototypeOf(async function(){}).constructor;const H=await (new AF('figma',(await figma.getNodeByIdAsync('4:2')).characters))(figma);const {P,T,A,ad,spacer,I,pill,brandPill,btn,card,bar,hr,dot,kv,table,seg}=H;
const pg=figma.currentPage;
// ===== COVER
const cv=A('V',{n:'Cover',bg:'bg/ink',w:1600,h:900,p:[72,88],gap:28,clip:true});pg.appendChild(cv);cv.x=0;cv.y=0;
const lg=A('H',{gap:12,ai:'CENTER'});const m=A('H',{bg:'accent/primary',r:10,p:8});ad(m,I('route',26,'text/inverse'));ad(lg,m,T('Waypoint',24,'b','text/inverse'));ad(cv,lg);
spacer(cv);
ad(cv,pill('TECH-TRIATHLON 2026 · DESIGNATHON','primary',{solid:true,lg:true}));
ad(cv,T('Delivery planning that explains itself',64,'b','text/inverse',{w:1100}));
ad(cv,T('One system connecting ordering, planning, loading, delivery and receipt across four roles — so Waypoint Fresh, Style and Tech can share one fleet, make deferral decisions they can explain, and keep working when the signal drops.',22,'r','text/on-ink-muted',{w:1100}));
const roles=A('H',{gap:12});for(const [ic,r,d] of [['grid','Dispatcher','Desktop · Peliyagoda office'],['box','Loader','Shared dock tablet + phone'],['truck','Driver','Personal phone · offline-first'],['store','Store manager','Counter desktop + phone']]){const c=A('H',{bg:'bg/ink-2',r:12,p:[14,16],gap:12,ai:'CENTER'});const ib=A('H',{bg:'accent/primary',r:8,p:7});ad(ib,I(ic,20,'text/inverse'));const x=A('V',{gap:2});ad(x,T(r,16,'b','text/inverse'),T(d,12,'r','text/on-ink-muted'));ad(c,ib,x);ad(roles,c);}ad(cv,roles);
spacer(cv);
const ft=A('H',{gap:48});for(const [k,v] of [['Team','Daffy Duck'],['Submitted','Tue 29 Sep 2026'],['Pages','01 Overview · 02 Screens by role · 03 Degradation'],['Screens','D1–D6 · L1–L3 · R1–R5 · S1–S4 · DG1–DG6']]){const x=A('V',{gap:4});ad(x,T(k,11,'b','text/on-ink-muted',{up:true,ls:8}),T(v,15,'s','text/inverse'));ad(ft,x);}ad(cv,ft);
// ===== PROBLEM FRAMING
const pf=A('V',{n:'Problem framing & scope',bg:'bg/canvas',w:1900,p:64,gap:32});pg.appendChild(pf);pf.x=1700;pf.y=0;
const ph=A('V',{gap:8});ad(ph,pill('01 · PROBLEM FRAMING','primary',{lg:true}),T('What’s really broken, and what we fix first',40,'b'),T('Waypoint’s three brands compete for one fleet of 60 vehicles. Most days demand exceeds capacity — and today every decision lives in one dispatcher’s spreadsheet, phone and memory.',18,'r','text/secondary',{w:1300}));ad(pf,ph);
const row=A('H',{gap:24});ad(pf,[row,'w']);
const tc=card({p:0,gap:0,clip:true});ad(row,[tc,'w']);
ad(tc,[table([{l:'Problem in the brief',w:260},{l:'Felt by',w:170},{l:'Our response'},{l:'Screens',w:110}],[
['Planning is fragmented','Dispatcher, stores','Store orders arrive structured and confirmed into one queue; auto-plan + validated override replaces the spreadsheet','S1 · D1 · D2'],
['Deferrals lack a record','Dispatcher, stores','Every deferral carries reason, score and consequence; 14-day service strip enforces fairness','D2 · D3 · S3'],
['Progress is invisible','Dispatcher','Exception-first control tower; offline vehicles shown honestly, never as “on time”','D4'],
['No feedback loop','Loader, driver, store','Shortfall flag before departure; digital POD; receipt checked against POD','L3 · R3 · S4'],
['Demand is hard to anticipate','Dispatcher','10-week forecast → reefers, trucks, drivers needed, with actions','D5 · D6'],
['Service time & lateness unpredicted','Dispatcher, store','Late-risk badges on stops and live ETA windows (Datathon models plug in)','D4 · R1 · S2'],
['Connectivity is unreliable','Driver, loader','Offline-first driver app with outbox, idempotent sync and visible conflicts','R5 · DG1–DG3']]),'w']);
const col=A('V',{w:560,gap:16});ad(row,[col,'h']);
const inn=card({gap:8});ad(inn,T('Prioritised — in scope',16,'b'));for(const s of ['The daily loop: order → plan → load → deliver → receipt','Explainable allocation under capacity pressure','Offline delivery with trustworthy sync','Weekly capacity outlook from forecasts'])ad(inn,(()=>{const r=A('H',{gap:8});ad(r,I('check',16,'tone/success'),T(s,14,'r','text/primary',{w:480}));return r;})());ad(col,[inn,'w']);
const out=card({gap:8});ad(out,T('Deliberately out of scope',16,'b'));for(const s of ['Turn-by-turn navigation (hand off to Google Maps)','Invoicing, payments and pricing','Warehouse inventory / WMS','Driver rostering and HR','End-customer parcel tracking'])ad(out,(()=>{const r=A('H',{gap:8});ad(r,I('x',16,'text/muted'),T(s,14,'r','text/secondary',{w:480}));return r;})());ad(col,[out,'w']);
const as=card({gap:8});ad(as,T('Assumptions',16,'b'));for(const s of ['Each depot plans independently; vehicles serve only their home depot','Users sign in with phone number + PIN; the dock tablet is shared','English first; Sinhala and Tamil strings planned','Drivers interact only when safely stopped'])ad(as,(()=>{const r=A('H',{gap:8});ad(r,I('info',16,'tone/info'),T(s,14,'r','text/secondary',{w:480}));return r;})());ad(col,[as,'w']);
const tr=A('H',{bg:'bg/ink',r:16,p:32,gap:32});ad(pf,[tr,'w']);
const tl=A('V',{w:520,gap:10});ad(tl,pill('CORE TRADEOFF','warning',{solid:true}),T('Explainable, dispatcher-in-the-loop allocation over a black-box optimiser',28,'b','text/inverse',{w:520}));ad(tr,tl);
ad(tr,[T('A fully automatic optimiser might squeeze a few percent more capacity, but dispatchers must defend every deferral to stores and brand leads, and they hold knowledge the data doesn’t (a closed road, a manager’s special request). So the engine proposes a feasible plan, explains it (binding constraint, priority score, consequence of each deferral) and validates every manual change against all hard constraints — the human decides. The cost: a slightly less optimal plan and a few minutes of dispatcher attention per day. The gain: trust, fairness, and decisions Waypoint can explain.',17,'r','text/on-ink-muted',{w:1100}),'g']);
return {cover:cv.id,pf:pf.id};
