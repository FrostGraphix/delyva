/* Helpers: status bars, island, tab bars, and the drawn SVG icon set (replaces emoji in UI chrome). */
(function(){
  const P={
    home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 11.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6"/>',
    receipt:'<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    utensils:'<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-2.5 1-4 3.5-4 7 0 2 1 3 4 3"/>',
    bike:'<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-8H9M14 9h3l1 8"/>',
    wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
    inbox:'<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
    map:'<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    power:'<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    bell:'<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>',
    heart:'<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    share:'<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>',
    send:'<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    sos:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
    pin:'<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    chart:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
    users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M17 4.5a3.5 3.5 0 0 1 0 7M22 20a6 6 0 0 0-4-5.6"/>',
    dollar:'<path d="M12 3v18M16 7.5C15 6.5 13.7 6 12 6c-2.5 0-4 1.2-4 3s1.5 2.6 4 3 4 1.2 4 3-1.5 3-4 3c-1.7 0-3-.5-4-1.5"/>',
    gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2-3-5-3-5-1s3 1 5 1zm0 0c2-3 5-3 5-1s-3 1-5 1z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    star:'<path style="fill:#FFB020;stroke:#FFB020" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    leaf:'<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l7-7"/>',
    building:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4"/>',
    card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
    bank:'<path d="M3 10 12 4l9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
    camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    battery:'<rect x="2" y="8" width="17" height="9" rx="2"/><path d="M22 11v3"/>',
    alert:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    check:'<path d="M5 12l5 5 9-10"/>',
    tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    wrench:'<path d="M14.5 6.5a4 4 0 0 0 5 5L10 21a2.1 2.1 0 0 1-3-3z"/>'
  };
  const MAP={'🏠':'home','🔍':'search','🛒':'cart','🧾':'receipt','👤':'user','🍽':'utensils','🛵':'bike','🏍':'bike','💰':'wallet','💵':'wallet',
    '⚙':'settings','📥':'inbox','🗺':'map','⏻':'power','🔔':'bell','←':'back','✕':'x','♡':'heart','⤴':'share','📞':'phone','💬':'chat','➤':'send',
    '🗑':'trash','☰':'menu','🆘':'sos','＋':'plus','⤓':'download','📍':'pin','📊':'chart','👥':'users','💲':'dollar','🎁':'gift','☀':'sun','🛡':'shield',
    '⭐':'star','⏱':'clock','🕘':'clock','⚡':'zap','🌿':'leaf','🏢':'building','💳':'card','🏦':'bank','👛':'wallet','📷':'camera','🔋':'battery',
    '⚠':'alert','✓':'check','🏷':'tag','ℹ':'info','🔧':'wrench','🏠':'home'};
  const svg=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
  window.dIcon=svg;
  const keys=Object.keys(MAP).map(k=>k).join('|');
  const RE=new RegExp('('+keys+')\\uFE0F?','g');

  const sb=l=>`<div class="statusbar ${l?'light':''}"><span>9:41</span><span>●●●● 5G ▮</span></div>`;
  const tabs={
    customer:[['🏠','Home'],['🔍','Search'],['FAB','🛒'],['🧾','Orders'],['👤','Profile']],
    merchant:[['📥','Orders'],['🍽','Menu'],['FAB','🛵'],['💰','Earnings'],['⚙','Store']],
    rider:[['🏍','Home'],['🗺','Map'],['FAB','⏻'],['💵','Earnings'],['👤','Profile']]
  };
  const bar=(a,on)=>`<div class="tabbar">`+tabs[a].map((t,i)=>t[0]==='FAB'
    ?`<div class="tab-fab ${a==='customer'?'':'dark'}">${t[1]}</div>`
    :`<div class="tab ${i===on?'on':''}"><span class="ic">${t[0]}</span>${t[1]}</div>`).join('')+`</div>`;

  document.querySelectorAll('.phone').forEach(p=>{if(!p.classList.contains('tablet'))p.insertAdjacentHTML('afterbegin','<div class="island"></div>')});
  document.querySelectorAll('[data-sb]').forEach(e=>{e.outerHTML=sb(e.dataset.sb==='light')});
  document.querySelectorAll('[data-tabs]').forEach(e=>{const[a,i]=e.dataset.tabs.split(':');e.outerHTML=bar(a,+i)});

  // swap emoji for drawn icons inside UI chrome only (food/product imagery stays)
  const SEL='.icon-btn,.tab .ic,.tab-fab,.nav>span:first-child,.field,.btn,.chip,.tag,.pill,.toast,.card.row>span:first-child,.card .row>span:first-child,.small,.price-row span';
  document.querySelectorAll(SEL).forEach(el=>{
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
    nodes.forEach(n=>{
      let t=n.nodeValue;
      if(el.classList.contains('icon-btn')&&t.trim()==='?'){const s=document.createElement('span');s.innerHTML=svg('help');n.replaceWith(s.firstChild);return}
      if(!RE.test(t)){RE.lastIndex=0;return}RE.lastIndex=0;
      const span=document.createElement('span');span.style.display='contents';
      span.innerHTML=t.replace(RE,(_,k)=>svg(MAP[k]));n.replaceWith(span);
    });
  });
  document.querySelectorAll('.nav>span:first-child').forEach(s=>s.classList.add('i'));
})();
/* client view: sticky nav + jump-to-section bar */
(function(){
  const heads=[...document.querySelectorAll('.section-h')];
  const title=document.querySelector('.page-sub')||document.querySelector('.topnav');
  if(heads.length>1&&title&&!document.querySelector('.jump')){
    const j=document.createElement('nav');j.className='jump';
    j.innerHTML='<span>Jump to</span>'+heads.map((h,i)=>{h.id='s'+(i+1);const t=h.querySelector('h2').textContent;return `<a href="#s${i+1}">${t.length>34?t.slice(0,32)+'…':t}</a>`}).join('');
    title.after(j);
  }
})();
if(location.hash==='#embed')document.documentElement.classList.add('embed');
