/* ============================================================
   THE DIVE — scroll choreography
   Scroll progress (0..1) drives a full skydive. The jumper is
   the focus: exit tumble, speed-scaled buffeting, streaming
   hair, canopy snatch, pendulum under wind, flare on landing.
   ============================================================ */
(function () {
  "use strict";

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const inv   = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const smooth = t => t * t * (3 - 2 * t);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };
  const pulse = (p, c, w) => clamp(1 - Math.abs(p - c) / w, 0, 1);

  function curve(p, pts) {
    if (p <= pts[0][0]) return pts[0][1];
    if (p >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [pa, va] = pts[i], [pb, vb] = pts[i + 1];
      if (p >= pa && p <= pb) return lerp(va, vb, (p - pa) / (pb - pa));
    }
    return pts[pts.length - 1][1];
  }
  const hex = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  function mixHex(h1, h2, t) {
    const a = hex(h1), b = hex(h2);
    return `rgb(${Math.round(lerp(a[0],b[0],t))},${Math.round(lerp(a[1],b[1],t))},${Math.round(lerp(a[2],b[2],t))})`;
  }

  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const stars = $("stars");
  const cFar = $("cloudsFar"), cMid = $("cloudsMid"), cNear = $("cloudsNear");
  const wind = $("windfield");
  const plane = $("plane");
  const rig = $("rig"), diver = $("diver"), canopy = $("canopy");
  const poseFF = $("poseFreefall"), poseCP = $("poseCanopy");
  const ponyFF = $("ponyFF"), ponyCP = $("ponyCP");
  const rain = $("rain"), bolt = $("lightning");
  const ground = $("ground"), dz = $("dropzone"), dust = $("dust");
  const flash = $("flash");
  const altEl = $("alt"), spdEl = $("spd"), phaseEl = $("phase");

  const SKY = [
    { p:0.00, t:"#04050d", b:"#142a52" },
    { p:0.18, t:"#081634", b:"#27538f" },
    { p:0.42, t:"#123163", b:"#4a86c8" },
    { p:0.52, t:"#26313f", b:"#566571" },
    { p:0.68, t:"#1b242f", b:"#414e59" },
    { p:0.82, t:"#5a6f93", b:"#a9bdca" },
    { p:1.00, t:"#83b3e6", b:"#dcebdd" },
  ];
  function skyColors(p) {
    let a = SKY[0], b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i++)
      if (p >= SKY[i].p && p <= SKY[i+1].p) { a = SKY[i]; b = SKY[i+1]; break; }
    const t = inv(p, a.p, b.p);
    return [mixHex(a.t, b.t, t), mixHex(a.b, b.b, t)];
  }

  const ALT = [[0,14000],[0.10,13600],[0.18,12800],[0.45,5400],
               [0.55,4700],[0.78,1300],[0.90,360],[0.97,40],[1,0]];
  const SPD = [[0,0],[0.10,18],[0.30,120],[0.45,120],[0.50,72],
               [0.55,16],[0.78,15],[0.92,12],[0.97,5],[1,0]];

  let struck = { a:false, b:false }, dusted = false;
  function strike(){ bolt.classList.remove("strike"); void bolt.offsetWidth; bolt.classList.add("strike"); }

  let target = 0, cur = 0;
  function readScroll(){
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  function render(now) {
    cur += (target - cur) * 0.12;
    const p = cur;
    const t = now * 0.001;
    root.style.setProperty("--p", p.toFixed(4));

    /* ----- SKY ----- */
    const [st, sb] = skyColors(p);
    root.style.setProperty("--sky-top", st);
    root.style.setProperty("--sky-bot", sb);
    stars.style.opacity = (1 - inv(p, 0.04, 0.20)).toFixed(3);
    root.style.setProperty("--glow", inv(p, 0.80, 0.99).toFixed(3));

    /* ----- CLOUD PARALLAX (rush hard during freefall) ----- */
    const fall = curve(p, [[0,0],[0.18,0.05],[0.45,0.6],[1,1]]);
    cFar.style.transform  = `translate3d(0,${(-fall*70).toFixed(1)}vh,0)`;
    cMid.style.transform  = `translate3d(0,${(-fall*160).toFixed(1)}vh,0)`;
    cNear.style.transform = `translate3d(0,${(-fall*320).toFixed(1)}vh,0)`;
    const clOp = 1 - inv(p, 0.80, 0.95);
    cFar.style.opacity  = (0.45 * clOp).toFixed(3);
    cMid.style.opacity  = (0.70 * clOp).toFixed(3);
    cNear.style.opacity = (0.92 * clOp).toFixed(3);

    /* ----- SPEED MODEL (drives buffeting & blur) ----- */
    const spd = curve(p, SPD);
    const speedN = clamp(spd / 120, 0, 1);
    const fallingFast = curve(p, [[0.16,0],[0.22,1],[0.46,1],[0.53,0],[1,0]]);

    /* ----- AIRCRAFT (idle hum via CSS; banks away on exit) ----- */
    const gone = inv(p, 0.09, 0.21);
    plane.style.opacity = (1 - gone).toFixed(3);
    plane.style.transform =
      `translate(-50%,-50%) translate(${(-gone*46).toFixed(1)}vw,${(-gone*26).toFixed(1)}vh) ` +
      `rotate(${(-gone*16).toFixed(1)}deg) scale(${(1-gone*0.7).toFixed(3)})`;

    /* ===== THE JUMPER ===== */

    // 1. EXIT — launch from the door and tumble into the airflow
    const exitE = easeOutCubic(inv(p, 0.05, 0.20));
    const exX = lerp(-2.5, 0, exitE);                    // vw
    const exY = lerp(-19, 0, exitE) + Math.sin(exitE*Math.PI)*9; // vh, arcs out
    const exScale = lerp(0.5, 1, exitE);
    const exRot = lerp(0, -415, exitE);                  // full tumble out

    // 2. FREEFALL — wind buffeting + high-speed jitter (the "fast drop")
    const buffet = speedN * fallingFast;
    const jx = (Math.random()-0.5) * 16 * buffet;        // px
    const jy = (Math.random()-0.5) * 12 * buffet;        // px
    const jr = (Math.random()-0.5) * 5 * buffet
             + Math.sin(t*23) * 3.2 * buffet;            // deg vibration
    const ffDriftX = Math.sin(t*0.8) * 2.4 * fallingFast;     // vw lateral drift
    const ffPitch  = Math.sin(t*2.6) * 4 * fallingFast;       // deg unstable pitch
    const breathe  = 1 + Math.sin(t*7) * 0.018 * fallingFast; // body flutter

    // 3. DEPLOY — violent upward snatch, then a damped bounce
    let yank = 0;
    const dpd = inv(p, 0.455, 0.62);
    if (dpd > 0 && dpd < 1) yank = -78 * Math.sin(dpd*Math.PI*3.1) * (1-dpd); // px

    // 4. UNDER CANOPY — slow pendulum + gust kicks
    const windAmp = curve(p, [[0.5,0],[0.57,1],[0.72,1.35],[0.86,0.45],[1,0.12]]);
    const penX = (Math.sin(t*1.05) + Math.sin(t*0.41)*0.5) * 3.6 * windAmp; // vw
    const penR = Math.sin(t*1.05 + 0.3) * 9 * windAmp;                      // deg
    const gust = Math.sin(t*0.33) * Math.sin(t*2.7) * 2.2 * windAmp;        // vw kick

    // 5. LANDING — settle onto the field and flare
    const settle = smooth(inv(p, 0.86, 1)) * 15;          // vh down
    const flareR = smooth(inv(p, 0.93, 1)) * -15;         // deg lean-back flare

    rig.style.transform =
      `translate(-50%,-50%) ` +
      `translate(${(exX + ffDriftX + penX + gust).toFixed(2)}vw, ${(exY + settle).toFixed(2)}vh) ` +
      `translate(${jx.toFixed(1)}px, ${(jy + yank).toFixed(1)}px) ` +
      `scale(${(exScale * breathe).toFixed(3)})`;
    diver.style.transform =
      `rotate(${(exRot + jr + ffPitch + penR + flareR).toFixed(2)}deg)`;
    diver.style.opacity = inv(p, 0.045, 0.12).toFixed(3);

    // motion blur scales with fall speed, gone once under canopy
    const mb = (speedN * 2.8 * fallingFast).toFixed(2);
    diver.style.filter = `drop-shadow(0 12px 18px rgba(0,0,0,.45)) blur(${mb}px)`;

    // pose crossfade at deployment
    const dep = inv(p, 0.455, 0.52);
    poseFF.style.opacity = (1 - dep).toFixed(3);
    poseCP.style.opacity = dep.toFixed(3);

    // hair whips harder the faster she falls / the stronger the wind
    const whipAmp = 8 + 26 * speedN * fallingFast + 30 * windAmp;
    const whip  = Math.sin(t*6.2)*0.55*whipAmp + Math.sin(t*2.4+0.7)*0.45*whipAmp - 16;
    const whip2 = Math.sin(t*1.5)*0.6*(whipAmp*0.5) + Math.sin(t*3.3)*0.4*(whipAmp*0.5) + 8;
    ponyFF.style.transform = `rotate(${whip.toFixed(2)}deg)`;
    ponyCP.style.transform = `rotate(${whip2.toFixed(2)}deg)`;

    // canopy unfurl
    const open = inv(p, 0.45, 0.55);
    if (open > 0) {
      const s = easeOutBack(open);
      canopy.style.opacity = clamp(open*2, 0, 1).toFixed(3);
      canopy.style.transform =
        `translateX(-50%) scale(${(0.02 + s*0.98).toFixed(3)}) rotate(${(penR*0.7).toFixed(2)}deg)`;
    } else {
      canopy.style.opacity = "0";
      canopy.style.transform = "translateX(-50%) scale(.02)";
    }

    /* ----- WIND STREAKS ----- */
    wind.style.opacity = (0.7 * fallingFast).toFixed(3);

    /* ----- WEATHER ----- */
    const wx = curve(p, [[0.50,0],[0.58,1],[0.72,1],[0.82,0],[1,0]]);
    rain.style.opacity = (0.85 * wx).toFixed(3);
    if (p > 0.585 && !struck.a) { struck.a = true; strike(); }
    if (p > 0.685 && !struck.b) { struck.b = true; strike(); }
    if (p < 0.55) { struck.a = struck.b = false; }

    /* ----- GROUND RUSHES UP ----- */
    const land = smooth(inv(p, 0.74, 0.985));
    ground.style.transform = `translateY(${((1 - land)*100).toFixed(2)}%)`;
    dz.style.transform =
      `translate(-50%,-50%) scale(${lerp(0.35, 3.4, smooth(inv(p,0.78,1))).toFixed(3)})`;

    if (p > 0.965 && !dusted) {
      dusted = true;
      dust.animate(
        [{ transform:"translateX(-50%) scale(0)", opacity:0.9 },
         { transform:"translateX(-50%) scale(14)", opacity:0 }],
        { duration:900, easing:"ease-out", fill:"forwards" });
    }
    if (p < 0.94) dusted = false;

    /* ----- CINEMATIC PUNCH ----- */
    root.style.setProperty("--gforce", (0.62 * fallingFast).toFixed(3));
    const shakeAmp = pulse(p, 0.49, 0.05) * 18;
    root.style.setProperty("--shake", `${(Math.sin(t*60)*shakeAmp).toFixed(2)}px`);
    flash.style.opacity = Math.max(
      pulse(p, 0.49, 0.012) * 0.7,
      pulse(p, 0.973, 0.012) * 0.85
    ).toFixed(3);

    /* ----- HUD ----- */
    altEl.textContent = Math.round(curve(p, ALT) / 10) * 10;
    spdEl.textContent = Math.round(spd);
    phaseEl.textContent =
      p < 0.10 ? "Ready" :
      p < 0.18 ? "Exit" :
      p < 0.45 ? "Freefall" :
      p < 0.55 ? "Deploy" :
      p < 0.74 ? "Weather" :
      p < 0.92 ? "Approach" : "Landed";

    requestAnimationFrame(render);
  }

  window.addEventListener("scroll", readScroll, { passive:true });
  window.addEventListener("resize", readScroll);
  readScroll();
  requestAnimationFrame(render);
})();
