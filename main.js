/* Night Dealer — vanilla skeleton (JS) */
(() => {
  'use strict';

  // ===== Palette (1-bit + teintes CSS en rendu) =====
  const PAL = {
    night: '#0B0E12', shadow: '#2A2F36', moon: '#E2C044',
    arcane: '#6F5AFF', hex: '#D14D4D', ward: '#3BA7A9',
    white:'#FFFFFF', black:'#000000'
  };

  // ===== RNG (xorshift32) — deterministic seeds for testing =====
  function XS32(seed=0xC0FFEE) {
    let s = seed|0;
    const next = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s>>>0);
    };
    return {
      next,
      int:(n)=> next()%n,
      float:()=> (next()>>>0) / 0xFFFFFFFF
    };
  }

  // ===== Helpers =====
  const idx = (x,y)=> y*3+x;                   // 0..8
  const inb = (x,y)=> x>=0 && x<3 && y>=0 && y<3;
  const neigh4 = i => {                         // N,E,S,W indices
    const x=i%3,y=(i/3)|0, r=[];
    if(inb(x, y-1)) r.push(idx(x,y-1));
    if(inb(x+1,y)) r.push(idx(x+1,y));
    if(inb(x, y+1)) r.push(idx(x,y+1));
    if(inb(x-1,y)) r.push(idx(x-1,y));
    return r;
  };
  const RPS = { ATK:{win:'HEX',lose:'WARD'}, HEX:{win:'WARD',lose:'ATK'}, WARD:{win:'ATK',lose:'HEX'} };

  // ===== State =====
  const nd = window.nd = {};
  const rng = nd.rng = XS32(Date.now()|0);

  nd.state = {
    board: Array.from({length:9},()=>({owner:0,type:null,aff:null,shield:0,curse:null})),
    traps: {1:-1, 2:-1},     // traps: index of one active token per player, -1 if none
    wheels: {1: [], 2: []},  // Array of 5 affinities to set on a roll
    used: {1:[0,0,0,0,0], 2:[0,0,0,0,0]}, // 1 if wheel consumed
    reroll: {1:2, 2:2},   // (First turn uses 1 mandatory roll)
    eclipseUsed: {1:0, 2:0},   // Number of times eclipse has been used
    omen: {1:0, 2:1},     // P2 has 1 flip cancellation
    turn: {who:1, n:1, placed:[]}, // placed: cells chosen this turn (revealed on validate)
    score: {1:0, 2:0}, round:1    // Current score & round number
  };

  // ===== Canvas bootstrap (HiDPI safe) =====
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  function fitDPI() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    const cssW = cvs.clientWidth || 320, cssH = cvs.clientHeight || 320;
    cvs.width = Math.round(cssW*dpr);
    cvs.height = Math.round(cssH*dpr);
    ctx.setTransform(cvs.width/320, 0, 0, cvs.height/320, 0, 0); // virtual space 320×320
    draw();
  }
  window.addEventListener('resize', fitDPI, {passive:true});

  // ===== Basic draw (board + tokens + traps) =====
  function drawBoardGrid() {
    ctx.fillStyle = PAL.night;
    ctx.fillRect(0,0,320,320);

    // 3×3 grid area (centered)
    const ox=64, oy=64, s=192, cell=s/3;
    ctx.strokeStyle = PAL.shadow; ctx.lineWidth = 2;
    ctx.strokeRect(ox,oy,s,s);
    for(let i=1;i<3;i++){
      ctx.beginPath(); ctx.moveTo(ox+i*cell,oy); ctx.lineTo(ox+i*cell,oy+s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox,oy+i*cell); ctx.lineTo(ox+s,oy+i*cell); ctx.stroke();
    }

    // checker texture (1-bit rug)
    for(let y=0;y<3;y++)for(let x=0;x<3;x++){
      ctx.fillStyle = ((x+y)&1)? PAL.black : PAL.white;
      ctx.fillRect(ox+x*cell+2, oy+y*cell+2, cell-4, cell-4);
    }
  }

  function drawTokens() {
    const ox=64, oy=64, s=192, cell=s/3;
    const {board,traps} = nd.state;

    // traps (tokens)
    for (const p of [1,2]) {
      const ti = traps[p];
      if (ti>=0) {
        const x=ti%3, y=(ti/3)|0;
        const cx = ox+x*cell+cell/2, cy = oy+y*cell+cell/2;
        ctx.strokeStyle = PAL.moon; ctx.fillStyle = PAL.shadow;
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      }
    }

    // pieces
    for(let i=0;i<9;i++){
      const c = board[i]; if(!c.type) continue;
      const x=i%3, y=(i/3)|0;
      const cx = ox+x*cell+cell/2, cy = oy+y*cell+cell/2;
      // owner tint ring
      ctx.strokeStyle = c.owner===1 ? PAL.arcane : PAL.hex;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx,cy,20,0,Math.PI*2); ctx.stroke();
      // draw symbol
      if (c.type==='ATK') { // three scratches
        ctx.strokeStyle = PAL.white; ctx.lineWidth=2;
        for(let k=-1;k<=1;k++){
          ctx.beginPath(); ctx.moveTo(cx-8, cy-6+k*4); ctx.lineTo(cx+8, cy-2+k*4); ctx.stroke();
        }
      } else if (c.type==='HEX') { // rune/eye
        ctx.strokeStyle = PAL.hex; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(cx,cy,10,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle = PAL.hex; ctx.fillRect(cx-1, cy-3, 2, 6);
      } else if (c.type==='WARD') { // seal
        ctx.strokeStyle = PAL.ward; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(cx-10,cy); ctx.lineTo(cx,cy-10); ctx.lineTo(cx+10,cy); ctx.lineTo(cx,cy+10); ctx.closePath(); ctx.stroke();
      } else if (c.type==='ECLIPSE') { // crescent
        ctx.fillStyle = PAL.moon; ctx.beginPath(); ctx.arc(cx,cy,10,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = PAL.night; ctx.beginPath(); ctx.arc(cx+4,cy,10,0,Math.PI*2); ctx.fill();
      }
      // shield pip
      if (c.shield>0){ ctx.fillStyle = PAL.ward; ctx.fillRect(cx+12, cy-12, 6, 6); }
      // curse mark
      if (c.curse){ ctx.fillStyle = PAL.hex; ctx.fillRect(cx-3, cy-14, 6, 6); }
    }

    // highlight pending placements (face-down until validate)
    const pend = nd.state.turn.placed;
    for (const p of pend) {
      const x=p%3, y=(p/3)|0;
      ctx.strokeStyle = PAL.arcane; ctx.setLineDash([4,3]);
      ctx.strokeRect(64+x*cell+4, 64+y*cell+4, cell-8, cell-8);
      ctx.setLineDash([]);
    }
  }

  function drawHUD(){
    document.getElementById('label-turn').textContent =
      `T${nd.state.turn.n} · J${nd.state.turn.who}`;
  }

  function draw(){
    drawBoardGrid();
    drawTokens();
    drawHUD();
  }

  // ===== Turn flow (stubs to expand) =====
  function startRound(){
    const s=nd.state;
    // roll initial faces here later; for now leave placeholders
    s.turn = {who: (rng.int(2)?1:2), n:1, placed:[]}; // random player starts
    draw();
  }

  function maybeReroll(){
    // TODO: implement wheel selection and reroll rules (1 per T2/T3)
  }

  function placeAt(cellIndex, tileType='ATK', affinity=null){
    const s=nd.state; const me=s.turn.who;
    if (s.turn.n===3 && s.turn.placed.length>=1) return; // cap 1 on T3
    if (s.turn.placed.length>=2) return; // cap 2 at T1/T2
    const c=s.board[cellIndex]; if (c.type) return; // occupied
    // queue placement (face-down)
    // TODO: implement ghost preview
    s.turn.placed.push(cellIndex);
    // store a temporary ghost (for preview) — real commit happens on validate/resolve
    s.board[cellIndex] = {owner:me,type:tileType,aff:affinity||tileType,shield:0,curse:null};
    draw();
  }

  function validate(){
    // Resolve order (Piège tag -> On-place -> Trap triggers -> RPS -> Delayed -> Omen)
    // TODO: implement full rules; for now, just commit placements without effects
    nd.state.turn.placed.length = 0;
    // next turn
    const t=nd.state.turn;
    if (t.n<3){ nd.state.turn = {who: t.who===1?2:1, n: t.n, placed:[]}; }
    else { nd.state.turn = {who: t.who===1?2:1, n: 3, placed:[]}; } // ! keep simple for now
    draw();
  }

  // ===== Input =====
  function pickCellFromPointer(ev){
    const rect = cvs.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (320 / rect.width);
    const y = (ev.clientY - rect.top) * (320 / rect.height);
    const ox=64, oy=64, s=192, cell=s/3;
    if (x<ox||y<oy||x>=ox+s||y>=oy+s) return -1;
    const cx = Math.floor((x-ox)/cell), cy = Math.floor((y-oy)/cell);
    return idx(cx,cy);
  }

  cvs.addEventListener('pointerdown', (ev)=>{
    const i = pickCellFromPointer(ev); if (i<0) return;
    // TEMP: place ATK by default
    // TODO : wire wheels UI next
    placeAt(i, 'ATK');
  });

  document.getElementById('btn-validate').addEventListener('click', validate);
  document.getElementById('btn-reroll').addEventListener('click', maybeReroll);

  // ===== Boot =====
  fitDPI();
  startRound();
})();
