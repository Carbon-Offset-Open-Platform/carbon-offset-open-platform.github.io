(function(){
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.add("js-reveal");

  function revealAll(){
    document.querySelectorAll("[data-reveal]").forEach(function(el){ el.classList.add("is-in"); });
  }

  if(reduce){
    revealAll();
  } else if("IntersectionObserver" in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },{threshold:0.2, rootMargin:"0px 0px -8% 0px"});
    document.querySelectorAll("[data-reveal]").forEach(function(el){ io.observe(el); });
  } else {
    revealAll();
  }

  // Earth Century stat ticker: brief blur/lift pulse whenever the scrubber updates a value.
  if(!reduce){
    ["et-stat-ppm","et-stat-gap"].forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      var mo = new MutationObserver(function(){
        el.classList.remove("stat-pulse");
        void el.offsetWidth;
        el.classList.add("stat-pulse");
      });
      mo.observe(el,{characterData:true, childList:true, subtree:true});
    });
  }
})();
