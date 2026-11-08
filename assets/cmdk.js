(function(){
  var ITEMS=[
    {id:"top",title:"Home",note:"Back to top"},
    {id:"earth",title:"Earth Century",note:"Climate trajectory scrubber"},
    {id:"measured",title:"Measured",note:"3D point cloud of real measurements"},
    {id:"principles",title:"Principles",note:"What P7802 is built on"},
    {id:"how",title:"How it works",note:"Meter to registry, end to end"},
    {id:"journey",title:"Event journey",note:"One carbon event, step by step"},
    {id:"p7802",title:"IEEE P7802",note:"The working group SCOOP convenes"},
    {id:"maturity-quiz",title:"MMRV maturity quiz",note:"Find your maturity level"},
    {id:"projects",title:"Projects",note:"Start from the problem you have"},
    {id:"feature-map",title:"Feature map",note:"Build once, reuse everywhere"},
    {id:"role",title:"Role",note:"A utility, not an operator"},
    {id:"restatement",title:"Restatement",note:"Corrections as new entries"},
    {id:"roadmap",title:"Roadmap",note:"From standard to carbon economy"},
    {id:"learn",title:"Learn",note:"Start here, then go deeper"},
    {id:"developers",title:"Developers",note:"Core model spec"},
    {id:"portal",title:"Portal",note:"Sign in, one place for every role"},
    {id:"about",title:"Team",note:"The people behind SCOOP"},
    {id:"join",title:"Get involved",note:"Help write the rules"}
  ];

  var overlay,input,list,trigger,active=0,filtered=ITEMS.slice();

  function build(){
    trigger=document.createElement("button");
    trigger.type="button";
    trigger.className="cmdk-trigger";
    trigger.setAttribute("aria-label","Open quick navigation");
    trigger.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg><span class="cmdk-trigger-label">Jump to</span><kbd>⌘K</kbd>';
    document.body.appendChild(trigger);

    overlay=document.createElement("div");
    overlay.className="cmdk-overlay";
    overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");
    overlay.setAttribute("aria-label","Quick navigation");
    overlay.innerHTML=
      '<div class="cmdk-panel">'+
        '<div class="cmdk-input-row">'+
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>'+
          '<input class="cmdk-input" type="text" placeholder="Jump to a section…" autocomplete="off" spellcheck="false">'+
          '<span class="cmdk-esc">Esc</span>'+
        '</div>'+
        '<div class="cmdk-list" role="listbox"></div>'+
      '</div>';
    document.body.appendChild(overlay);

    input=overlay.querySelector(".cmdk-input");
    list=overlay.querySelector(".cmdk-list");

    trigger.addEventListener("click",open);
    overlay.addEventListener("mousedown",function(e){ if(e.target===overlay) close(); });
    input.addEventListener("input",function(){ filter(input.value); });
    input.addEventListener("keydown",onKey);
    document.addEventListener("keydown",onGlobalKey);

    render();
  }

  function onGlobalKey(e){
    var meta=e.metaKey||e.ctrlKey;
    if(meta&&(e.key==="k"||e.key==="K")){
      e.preventDefault();
      overlay.classList.contains("is-open")?close():open();
      return;
    }
    if(e.key==="Escape"&&overlay.classList.contains("is-open")) close();
  }

  function onKey(e){
    if(e.key==="ArrowDown"){ e.preventDefault(); move(1); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); move(-1); }
    else if(e.key==="Enter"){ e.preventDefault(); go(filtered[active]); }
    else if(e.key==="Escape"){ close(); }
  }

  function move(d){
    if(!filtered.length) return;
    active=(active+d+filtered.length)%filtered.length;
    render();
  }

  function filter(q){
    q=q.trim().toLowerCase();
    filtered=!q?ITEMS.slice():ITEMS.filter(function(it){
      return it.title.toLowerCase().indexOf(q)>-1||it.note.toLowerCase().indexOf(q)>-1;
    });
    active=0;
    render();
  }

  function render(){
    if(!filtered.length){
      list.innerHTML='<div class="cmdk-empty">No section matches that.</div>';
      return;
    }
    list.innerHTML=filtered.map(function(it,i){
      return '<button type="button" class="cmdk-item'+(i===active?" is-active":"")+'" role="option" data-id="'+it.id+'" aria-selected="'+(i===active)+'">'+
        '<span class="cmdk-item-title">'+it.title+'</span>'+
        '<span class="cmdk-item-note">'+it.note+'</span>'+
      '</button>';
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll(".cmdk-item"),function(btn){
      btn.addEventListener("click",function(){
        var item=ITEMS.filter(function(it){ return it.id===btn.getAttribute("data-id"); })[0];
        go(item);
      });
    });
    var activeEl=list.querySelector(".cmdk-item.is-active");
    if(activeEl) activeEl.scrollIntoView({block:"nearest"});
  }

  function go(item){
    if(!item) return;
    close();
    var el=document.getElementById(item.id);
    if(el) el.scrollIntoView({behavior:"smooth",block:"start"});
    history.pushState(null,"","#"+item.id);
  }

  function open(){
    overlay.classList.add("is-open");
    input.value="";
    filter("");
    input.focus();
  }

  function close(){
    overlay.classList.remove("is-open");
    trigger.focus();
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",build);
  } else {
    build();
  }
})();
