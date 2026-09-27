// 10 · Waypoint People, part B: P2 Staff directory (signature: pulling a folder), P3 Renewals tickler,
// P4 Sign-in access, P5 the folder on a phone. Needs 09 first (it creates the section and the tokens).
const {A,ad,spacer,screen}=H;
const {P,T,F,caps,typed,shadow,icon,btn,stamp,jobTab,indexCard,field,dividers,rail,head,ledger}=Q;
const pg=figma.root.children.find(p=>/Screens by role/i.test(p.name))||figma.currentPage;
await figma.setCurrentPageAsync(pg);await pg.loadAsync();
const sec=pg.findOne(n=>n.type==='SECTION'&&n.name.startsWith('HR · Waypoint People'));if(!sec)throw new Error('Run 09-people-a first');
for(const n of sec.children.filter(n=>n.y>=1700))n.remove(); // re-run safe: clear part B
const canvas=fr=>{fr.fills=[P('people/canvas')];return fr;};
const Y=1800;
const folderRow=(id,name,sub,j,st,on)=>{const r=F('H',{n:'Folder/'+id,bg:on?'manila':null,st:'manila-edge',sides:[1,0,0,0],p:[8,8],gap:12,ai:'CENTER',r:3});if(on)r.effects=shadow(2);const tab=F('H',{bg:on?'manila-2':'manila',st:'manila-edge',sides:[1,1,0,1],p:[2,6]});tab.topLeftRadius=3;tab.topRightRadius=3;ad(tab,typed(id,11.5,'manila-ink'));const tx=F('V',{gap:1});ad(tx,T(name,14,'s'),T(sub,12,'r','ink-2'));ad(r,tab,jobTab(j,true),[tx,'g']);if(st)ad(r,st);return r;};
const guide=l=>{const g=F('H',{gap:8,ai:'MAX',p:[8,0,4,0]});const t=F('H',{bg:'well',st:'line-strong',sides:[1,1,0,1],p:[2,8]});t.topLeftRadius=3;t.topRightRadius=3;ad(t,T(l,12,'b','ink-2'));const ln=F('H',{bg:'line-strong',h:1});ad(g,t,[ln,'g']);return g;};

// ── P2 · Staff directory + pulled folder ──
const p2=canvas(screen(sec,120,Y,1440,1320,'P2','Waypoint People · Staff directory','One folder per person, in every job. Choosing a person lifts their folder in the drawer and the manila folder opens beside it with the index cards: personal record, job and status, driving licence, sign-in access. A login is issued from here, so every login belongs to one staff record.',{d:'H'}));
ad(p2,[rail('Staff directory',{'Staff directory':[193],'Renewals':[5],'Sign-in access':[179]}),'h']);
const m2=F('V',{n:'Main',gap:0});ad(p2,[m2,'g']);
ad(m2,[head('Staff directory','One folder per person, in every job. Pull a folder to read or correct the record, issue a login, or record leave. Seeded people are synthetic demo records and are marked as such.',btn('Add a person','primary',{i:'plus'})),'w']);
const b2=F('H',{p:[0,32,32,32],gap:24,ai:'MIN'});ad(m2,[b2,'w']);
const drawer=F('V',{w:380,gap:10});ad(b2,drawer);
ad(drawer,[field('Search','Search name, id, phone, branch or licence',{ph:true}),'w']);
const well=F('V',{bg:'well',st:'line-strong',r:3,p:[8,8,0,8],gap:0,clip:true});ad(drawer,[well,'w']);
ad(well,[dividers([['All',193],['Drivers',60],['Loaders',9],['Dispatch',3],['Stores',119],['HR',2]],0),'w']);
const list=F('V',{bg:'manila-2',bgo:.4,p:8,gap:2});ad(well,[list,'w']);
ad(list,[guide('L'),'w']);
ad(list,[folderRow('EMP0035','Lahiru Rathnayake','Driver · Peliyagoda DC','driver'),'w'],[folderRow('EMP0059','Lahiru Samarakoon','Driver · Kandy hub','driver'),'w'],[folderRow('EMP0020','Lasantha Gunawardena','Driver · Peliyagoda DC','driver',null,true),'w'],[folderRow('EMP0044','Lasantha Perera','Driver · Peliyagoda DC','driver'),'w']);
ad(list,[guide('M'),'w']);
ad(list,[folderRow('EMP0176','Madhavi Abeysekara','Store manager · OUT102 Palapathwela','store'),'w'],[folderRow('EMP0168','Madhavi Gamage','Store manager · OUT094 Kandy City Centre II','store'),'w'],[folderRow('EMP0024','Mahesh Kumara','Driver · Peliyagoda DC','driver',stamp('On leave','stamp-leave',10)),'w'],[folderRow('EMP0048','Mahesh Rathnayake','Driver · Peliyagoda DC','driver'),'w']);
// The pulled folder.
const fw=F('V',{gap:0});ad(b2,[fw,'g']);
const ftw=F('H',{p:[0,0,0,24]});const ftab=F('H',{bg:'manila',st:'manila-edge',sides:[1,1,0,1],p:[10,16]});ftab.topLeftRadius=5;ftab.topRightRadius=5;ad(ftab,typed('EMP0020',12,'manila-ink'));ad(ftw,ftab);ad(fw,ftw);
const fo=F('V',{bg:'manila-2',st:'manila-edge',r:4,p:24,gap:18});fo.effects=shadow(2);ad(fw,[fo,'w']);
const fh=F('V',{gap:6});ad(fh,T('Lasantha Gunawardena',26,'b',undefined,{ls:-1.5}));const meta=F('H',{gap:12,ai:'CENTER'});ad(meta,jobTab('driver'),T('Peliyagoda DC',14,'r','manila-ink'),T('with Waypoint since',14,'r','manila-ink'),typed('1 May 2017',13,'manila-ink'));ad(fh,meta);const syn=F('H',{gap:6,ai:'CENTER'});ad(syn,typed('SYNTHETIC',12,'manila-ink','b'),T('demo record: not a real person. Names, phones and licences were generated for the Tech-Triathlon demo.',12,'r','manila-ink'));ad(fh,syn);ad(fo,[fh,'w']);
const two=(a,b)=>{const r=F('H',{gap:14});ad(r,[a,'g'],[b,'g']);return r;};
const pr=indexCard('Personal record');ad(pr.body,[field('Full name','Lasantha Gunawardena'),'w'],[two(field('Phone','+94 74 732 7083',{typed:true}),field('Email','name@example.com',{ph:true})),'w'],[field('Emergency contact','',{help:'Name, relationship and phone.'}),'w']);ad(fo,[pr.card,'w']);
const jb=indexCard('Job and status');ad(jb.body,[two(field('Job','Driver',{select:true,help:'A driver’s record stays a driver record.'}),field('Depot','Peliyagoda DC',{select:true})),'w'],[two(field('Started on','2017-05-01',{typed:true,date:true}),field('Status','In post',{select:true})),'w']);ad(fo,[jb.card,'w']);
const li=indexCard('Driving licence');const lr=F('H',{gap:14});ad(lr,[field('Licence number','B7613748',{typed:true}),'g'],[field('Class','C1',{typed:true,help:'B vans · C1 trucks'}),'g'],[field('Expires','2027-05-11',{typed:true,date:true}),'g']);const veh=F('H',{gap:8,ai:'CENTER'});ad(veh,icon('truck',16,'ink-2'),T('Drives',14,'r','ink-2'),typed('VEH006',13),T('. Dispatch assigns vehicles in the operations app.',14,'r','ink-2'));ad(li.body,[lr,'w'],veh);ad(fo,[li.card,'w']);
const ac=indexCard('Sign-in access',{aside:caps('No login',10.5,'stamp-leave')});ad(ac.body,T('Lands on: Driver app, on the vehicle dispatch assigned.',14,'r','ink-2'),[two(field('Username','lasantha.g',{typed:true,help:'Lowercase letters, digits, dots or dashes.'}),field('Starting password','monsoon-rail-8831',{typed:true,help:'You won’t see it again after issuing.'})),'w'],btn('Issue login','primary',{i:'lock'}));ad(fo,[ac.card,'w']);

// ── P3 · Renewals tickler ──
const p3=canvas(screen(sec,1720,Y,1440,900,'P3','Waypoint People · Renewals','A tickler file: every driving licence filed under the month it runs out, with Expired first. Month dividers wrap rather than scroll, so every month stays findable. Overdue cards carry the red EXPIRED stamp.',{d:'H'}));
ad(p3,[rail('Renewals',{'Staff directory':[193],'Renewals':[5],'Sign-in access':[179]}),'h']);
const m3=F('V',{n:'Main'});ad(p3,[m3,'g']);
ad(m3,[head('Renewals','Driving licences filed under the month they run out, counted from today (27 Sept 2026). 5 fall due within 90 days. A driver can’t be sent out on an expired licence.'),'w']);
const tw=F('V',{bg:'well',st:'line-strong',r:3,p:[8,8,0,8]});const b3=F('V',{p:[0,32,32,32]});ad(b3,[tw,'w']);ad(m3,[b3,'w']);
ad(tw,[dividers([['Expired',0,true],['Sept 26',0],['Oct 26',5],['Nov 26',0],['Dec 26',0],['Jan 27',5],['Feb 27',0],['Mar 27',0],['Apr 27',0],['May 27',5],['Jun 27',0],['Jul 27',0],['Aug 27',0],['Later',45]],2),'w']);
const tb=F('V',{bg:'manila-2',bgo:.4,p:16,gap:12});ad(tw,[tb,'w']);const th=F('H',{gap:8,ai:'BASELINE'});ad(th,T('October 2026',18,'b'),T('5 licences',14,'r','ink-2'));ad(tb,th);
const tg=F('H',{gap:12,wrap:12});ad(tb,[tg,'w']);
for(const [n,lic,cls,dep,v,leave] of [['Dinesh Rathnayake','B7613747','C1','Peliyagoda DC','VEH005'],['Isuru Fernando','B7613781','C1','Peliyagoda DC','VEH018'],['Asanka Fernando','B7613836','C1','Peliyagoda DC','VEH031'],['Tharindu Liyanage','B7613870','C1','Kandy hub','VEH044',1]]){const ic=indexCard(n,{w:520,aside:T('in 23 days',12,'s','stamp-leave')});const hd=ic.card.children[0];hd.children[0].remove();hd.insertChild(0,T(n,15,'s'));if(leave)hd.insertChild(2,stamp('On leave','stamp-leave',10));for(const [k,val] of [['Expires','20 Oct 2026'],['Licence',lic+' · class '+cls],['Works at',dep+' · '+v]]){const r=F('H',{gap:12,p:[0,0,6,0],st:'feint',sides:[0,0,1,0],ai:'CENTER'});const kk=F('H',{w:80});ad(kk,caps(k,10.5));ad(r,kk,typed(val,13));ad(ic.body,[r,'w']);}ad(tg,ic.card);}

// ── P4 · Sign-in access ──
const p4=canvas(screen(sec,3320,Y,1440,900,'P4','Waypoint People · Sign-in access','Who can sign in, and where each login lands. A ledger, not a card grid. Rows open the person’s folder at the Sign-in access card, because logins are issued and turned off there.',{d:'H'}));
ad(p4,[rail('Sign-in access',{'Staff directory':[193],'Renewals':[5],'Sign-in access':[179]}),'h']);
const m4=F('V',{n:'Main'});ad(p4,[m4,'g']);
ad(m4,[head('Sign-in access','Who can sign in, and where each login lands. Logins are issued from a person’s folder, so each one belongs to one staff record.'),'w']);
const b4=F('V',{p:[0,32,32,32],gap:14});ad(m4,[b4,'w']);
ad(b4,[dividers([['Everyone',194],['Can sign in',5],['Signed in now',2],['No login yet',179],['Turned off',0]],0),'w']);
const who=(j,n,id,st)=>{const x=F('H',{gap:10,ai:'CENTER'});const t=F('V',{gap:1});const s=F('H',{gap:4});ad(s,T(({driver:'Driver',store:'Store manager',hr:'HR officer',dispatcher:'Dispatcher',loader:'Loader'})[j]+' ·',12,'r','ink-2'),typed(id,12,'ink-2'));ad(t,T(n,14,'s'),s);ad(x,jobTab(j,true),t);if(st)ad(x,st);return x;};
const noLogin=()=>{const x=F('H',{gap:6,ai:'CENTER'});ad(x,icon('lock',13,'stamp-leave'),T('No login',13,'r','stamp-leave'));return x;};
ad(b4,[ledger([{l:'Person'},{l:'Username',w:170},{l:'Works at',w:230},{l:'Last sign-in',w:170},{l:'Sign-in',w:110}],[
 [who('hr','Anjali Wickramasinghe','EMP0001'),typed('admin'),'Peliyagoda DC',T('1 min ago · signed in',13,'r','success'),caps('On',11,'success')],
 [who('dispatcher','Nimali Perera','EMP0003'),typed('dispatcher'),'Peliyagoda DC',T('11 min ago · signed in',13,'r','success'),caps('On',11,'success')],
 [who('store','Akila Hettiarachchi','EMP0081',stamp('On leave','stamp-leave',10)),noLogin(),'OUT006 Maharagama','—',T('Issue login',13,'s','cabinet')],
 [who('driver','Ajith Bandara','EMP0062'),noLogin(),'Kandy hub','—',T('Issue login',13,'s','cabinet')],
 [who('driver','Ruwan Silva','EMP0011'),typed('driver'),'Peliyagoda DC','26 Sept',caps('On',11,'success')],
]),'w']);

// ── P5 · The folder on a phone ──
const p5=canvas(screen(sec,4920,Y,390,1320,'P5','Waypoint People · Folder on a phone','On a phone the drawer and the folder take turns: the folder fills the screen with a way back to the drawer, and the index cards stack in a single column.',{}));
const top=F('V',{bg:'cabinet',p:[14,16,12,16],gap:10});const tr=F('H',{gap:10,ai:'CENTER'});ad(tr,Q.mark(32));const tt=F('V');ad(tt,T('Waypoint People',16,'b','on-cabinet'),caps('Human resources',9.5,'on-cabinet-muted'));ad(tr,[tt,'g'],T('Sign out',12,'s','on-cabinet-muted'));ad(top,[tr,'w']);ad(p5,[top,'w']);
const pb=F('V',{p:16,gap:12});ad(p5,[pb,'w']);
const bk=F('H',{gap:6,ai:'CENTER'});ad(bk,icon('back',16,'cabinet'),T('Back to the drawer',14,'s','cabinet'));ad(pb,bk);
const mf=F('V',{bg:'manila-2',st:'manila-edge',r:4,p:14,gap:12});ad(pb,[mf,'w']);
ad(mf,T('Lasantha Gunawardena',22,'b',undefined,{w:320}));const mm=F('H',{gap:8,ai:'CENTER'});ad(mm,jobTab('driver'),T('Peliyagoda DC',13,'r','manila-ink'));ad(mf,mm);
const mp=indexCard('Personal record');ad(mp.body,[field('Full name','Lasantha Gunawardena'),'w'],[field('Phone','+94 74 732 7083',{typed:true}),'w']);ad(mf,[mp.card,'w']);
const ml=indexCard('Driving licence');ad(ml.body,[field('Licence number','B7613748',{typed:true}),'w'],[field('Expires','2027-05-11',{typed:true,date:true}),'w']);ad(mf,[ml.card,'w']);
const ma=indexCard('Sign-in access',{aside:caps('No login',10,'stamp-leave')});ad(ma.body,[field('Username','lasantha.g',{typed:true}),'w'],[btn('Issue login','primary',{i:'lock'}),'w']);ad(mf,[ma.card,'w']);


return {p2:p2.id,p3:p3.id,p4:p4.id,p5:p5.id};
