// 09 · Waypoint People, the HR panel (27 Sep 2026), part A: section, foundations, P0 Sign in, P1 Front desk.
// The admin console became the HR department's own product. Its look is the personnel file cabinet
// from apps/admin/DESIGN.md: cabinet-green rail, manila folders, index cards, rubber stamps.
// Names, phones and licences shown are synthetic demo records.
const {A,ad,spacer,screen,section}=H;
const {P,T,F,caps,typed,shadow,icon,btn,stamp,jobTab,indexCard,field,folderList,fl,rail,mark,head,ledger,JOB}=Q;
const pg=figma.root.children.find(p=>/Screens by role/i.test(p.name))||figma.currentPage;
await figma.setCurrentPageAsync(pg);await pg.loadAsync();
const old=pg.findOne(n=>n.type==='SECTION'&&n.name.startsWith('HR · Waypoint People'));if(old)old.remove();
const bottom=Math.max(0,...pg.children.map(n=>n.y+n.height));
const sec=section(pg,'HR · Waypoint People (added 27 Sep)',0,bottom+400,6700,3500);
const canvas=fr=>{fr.fills=[P('people/canvas')];return fr;};

// ── Foundations board ──
const fd=F('V',{n:'People · Foundations',bg:'canvas',w:1440,p:48,gap:28,r:0});sec.appendChild(fd);fd.x=120;fd.y=160;
const fh=F('H',{gap:16,ai:'CENTER'});ad(fh,mark(48));const ft=F('V',{gap:4});ad(ft,T('Waypoint People · foundations',32,'b'),T('The HR department’s panel: a personnel file cabinet. Operate mode: scan, find the folder, fix the card, file it back. Deliberately unlike the navy and teal logistics console.',15,'r','ink-2',{w:900}));ad(fh,ft);ad(fd,fh);
const sw=F('H',{gap:16,wrap:16});ad(fd,[sw,'w']);
for(const [k,l,note] of [['cabinet','Cabinet green','Rail, primary actions'],['canvas','Cabinet enamel','Page ground'],['card','Card stock','Index cards, sheets'],['manila','Manila','Open or filed folders only'],['manila-2','Manila light','Folder body'],['brass','Brass','Rail label holders and pulls only'],['card-red','Card red','Header rule on index cards'],['feint','Feint blue','One line per field row'],['stamp-leave','Stamp ochre','ON LEAVE'],['stamp-left','Stamp red','LEFT, EXPIRED'],['job-driver','Driver tab',''],['job-loader','Loader tab',''],['job-dispatcher','Dispatcher tab',''],['job-store','Store manager tab',''],['job-hr','HR officer tab','']]){const s=F('V',{gap:6,w:160});const chip=F('H',{bg:k,h:64,r:3,st:'line'});ad(s,[chip,'w'],T(l,13,'s'),T('people/'+k+(note?' · '+note:''),11,'r','muted',{w:160}));ad(sw,s);}
const ty=F('H',{gap:40,ai:'MIN'});ad(fd,ty);
const tcol=F('V',{gap:10});ad(tcol,T('Front desk',28,'b'),T('Archivo 14 · reading text, forms, tables',14),caps('Archivo Narrow caps · labels, column heads, drawer names',11),typed('Courier Prime · EMP0020 · 20 Oct 2026 · B7613747',13));ad(ty,tcol);
const kit=F('H',{gap:18,ai:'CENTER'});ad(kit,btn('Add a person','primary',{i:'plus'}),btn('Discard','secondary'),btn('File as left','danger'),stamp('On leave'),stamp('Left','stamp-left'),stamp('Expired','stamp-left'),jobTab('driver'),jobTab('store'));ad(ty,kit);
const rules=F('V',{gap:6,w:1300});for(const r of ['Manila means open: manila only where a record is open or filed.','Stamps are for exceptions: active people carry no stamp.','Five job tabs: job colours mean jobs and nothing else.','Typed data only: Courier Prime is for ids, dates, licence numbers and the register counts.','Every seeded person is a synthetic demo record and is labelled so.'])ad(rules,T('— '+r,14,'r','ink-2'));ad(fd,[rules,'w']);

// ── P0 · Sign in ──
const p0=canvas(screen(sec,1720,160,1440,900,'P0','Waypoint People · Sign in','HR officers only. The sign-in card sits in an open manila folder on the cabinet: the product announces its department before anything else. Everyone else is pointed to the operations app.',{}));
p0.fills=[P('people/cabinet')];p0.primaryAxisAlignItems='CENTER';p0.counterAxisAlignItems='CENTER';
const lc=F('V',{w:440,gap:24});ad(p0,lc);
const br=F('H',{gap:12,ai:'CENTER'});ad(br,mark(40));const bt=F('V',{gap:2});ad(bt,T('Waypoint People',20,'b','on-cabinet'),caps('Human resources · staff records and sign-in access',10.5,'on-cabinet-muted'));ad(br,bt);ad(lc,br);
const fw=F('V',{gap:0});ad(lc,[fw,'w']);
const tabw=F('H',{p:[0,0,0,20]});const tab=F('H',{bg:'manila',st:'manila-edge',sides:[1,1,0,1],p:[8,16]});tab.topLeftRadius=5;tab.topRightRadius=5;ad(tab,caps('HR · Staff only',11,'manila-ink'));ad(tabw,tab);ad(fw,tabw);
const folder=F('V',{bg:'manila-2',st:'manila-edge',r:4,p:20});folder.effects=shadow(2);ad(fw,[folder,'w']);
const sc=indexCard('Sign in');ad(folder,[sc.card,'w']);sc.body.itemSpacing=14;
ad(sc.body,[field('Username','admin',{typed:true}),'w'],[field('Password','••••••••',{focus:true}),'w'],[btn('Open the cabinet','primary',{i:'arrowr'}),'w']);
ad(lc,[T('Dispatchers, loaders, drivers and store managers sign in to the Waypoint operations app. Locked out? Another HR officer can reset your password.',14,'r','on-cabinet-muted',{w:440,al:'CENTER'}),'w']);

// ── P1 · Front desk ──
const p1=canvas(screen(sec,3320,160,1440,1180,'P1','Waypoint People · Front desk','What needs HR today, on the real calendar: licences in the tickler, who is on leave and when they’re back, and who can’t sign in yet. The day’s counts are a typed register line (not KPI tiles), each count a link into its drawer.',{d:'H'}));
ad(p1,[rail('Front desk',{'Staff directory':[193],'Renewals':[5],'Sign-in access':[179]}),'h']);
const m1=F('V',{n:'Main',gap:0});ad(p1,[m1,'g']);
ad(m1,[head('Front desk','What needs HR today, Sunday 27 September. Licences and leave follow the real calendar. Seeded people are synthetic demo records; anyone HR adds is real.',btn('Add a person','primary',{i:'plus'})),'w']);
const b1=F('V',{p:[0,32,32,32],gap:28});ad(m1,[b1,'w']);
const reg=F('H',{n:'Register line',gap:28,p:[12,0],ai:'BASELINE',st:'line-strong',sides:[1,0,1,0]});
for(const [n,l] of [['184','in post'],['9','on leave'],['179','can’t sign in yet'],['5','licences due in 90 days']]){const x=F('H',{gap:8,ai:'BASELINE'});ad(x,typed(n,22,'ink','b'),T(l,15,'r','ink-2',{u:true}));ad(reg,x);}
spacer(reg);ad(reg,T('193 on the books · 1 left Waypoint',12,'r','ink-2'));ad(b1,[reg,'w']);
const cols=F('H',{gap:28,ai:'MIN'});ad(b1,[cols,'w']);
const left=F('V',{gap:14});ad(cols,[left,'g']);
const lh=F('H',{gap:12,ai:'BASELINE'});ad(lh,T('Licence tickler',18,'b'),T('Driving licences expiring in the next 90 days',14,'r','ink-2'));spacer(lh);ad(lh,T('Open the tickler file',14,'s','cabinet'));ad(left,[lh,'w']);
const grid=F('H',{gap:12,wrap:12});ad(left,[grid,'w']);
for(const [n,lic,dep] of [['Dinesh Rathnayake','B7613747','Peliyagoda DC'],['Isuru Fernando','B7613781','Peliyagoda DC'],['Asanka Fernando','B7613836','Peliyagoda DC'],['Tharindu Liyanage','B7613870','Kandy hub']]){const ic=indexCard(n,{w:320,aside:T('in 23 days',12,'s','stamp-leave')});ic.card.children[0].children[0].remove();ic.card.children[0].insertChild(0,T(n,15,'s'));const r=F('H',{gap:16});ad(r,caps('Expires',10.5),typed('20 Oct 2026',13),caps('Licence',10.5),typed(lic,13));ad(ic.body,r,T(dep,13,'r','ink-2'));ad(grid,ic.card);}
ad(left,T('On the books, by depot area',18,'b'));
ad(left,[ledger([{l:'Job'},{l:'Peliyagoda',w:110},{l:'Kandy',w:90},{l:'All',w:70}],[['driver','Drivers',38,22,60],['loader','Loaders',6,3,9],['dispatcher','Dispatchers',2,1,3],['store','Store managers',74,45,119],['hr','HR officers',2,0,2]].map(([j,l,a,b,t])=>{const x=F('H',{gap:8,ai:'CENTER'});ad(x,jobTab(j,true),T(l,14));return [x,String(a),String(b),T(String(t),13,'b')];})),'w']);
const right=F('V',{gap:28,w:400});ad(cols,right);
const key=()=>{const x=F('H',{gap:4,ai:'CENTER'});ad(x,icon('lock',13,'cabinet'),T('Issue login',12,'s','cabinet'));return x;};
ad(right,[folderList('Can’t sign in yet',179,[fl('hr','Shanika Rodrigo',key()),fl('dispatcher','Harsha Gamage',key()),fl('dispatcher','Sachini Wijesinghe',key()),fl('loader','Dilhani Premadasa',key()),fl('loader','Pasindu Gamage',key())],400),'w']);
const back=d=>{const x=F('H',{gap:4,ai:'CENTER'});ad(x,T('back',12,'r','ink-2'),typed(d,12,'ink-2'));return x;};
ad(right,[folderList('On leave',9,[fl('driver','Mahesh Kumara',back('1 Oct 2026')),fl('store','Akila Hettiarachchi',back('3 Oct 2026')),fl('store','Ishara Mendis',back('3 Oct 2026')),fl('loader','Ishara Pathirana',back('6 Oct 2026')),fl('driver','Tharindu Liyanage',back('8 Oct 2026'))],400),'w']);
const lb=F('V',{gap:12});ad(b1,[lb,'w']);
const lbh=F('H',{gap:12,ai:'BASELINE'});ad(lbh,T('Logbook',18,'b'),T('3 signed in today · 5 logins on · 0 turned off',14,'r','ink-2'));ad(lb,[lbh,'w']);
const log=F('V',{bg:'card',st:'line',r:3});log.effects=shadow(1);
for(const [t,k,s,who] of [['11:24','SIGN-IN','Signed in to Waypoint People  ×3','Anjali Wickramasinghe · HR'],['11:13','SIGN-IN','Signed in to the operations app','Nimali Perera · Dispatch'],['11:11','RECORD','Updated Sachini Wijesinghe (EMP0005) · dispatcher · active','Anjali Wickramasinghe · HR']]){const r=F('H',{gap:16,p:[10,16],st:'feint',sides:[0,0,1,0]});const tx=F('V',{gap:2});ad(tx,T(s,14),T(who,12,'r','ink-2'));ad(r,typed(t,12,'ink-2'),caps(k,10.5,k==='RECORD'?'cabinet':'ink-2'),tx);ad(log,[r,'w']);}
ad(lb,[log,'w']);

return {section:sec.id,p0:p0.id,p1:p1.id};
