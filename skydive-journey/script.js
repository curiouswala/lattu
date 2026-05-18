/* ============================================================
   THE DIVE — scroll choreography
   Maps scroll progress (0..1) onto a full skydive.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- math helpers ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp  = (a, b, t) => a + (b - a) * t;
  const inv   = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const smooth = t => t * t * (3 - 2 * t);
  const easeOutBack = t => {
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  };

  // piecewise interpolation over [ [p,val], ... ] (p ascending)
  function curve(p, pts) {
    if (p <= pts[0][0]) return pts[0][1];
    if (p >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [pa, va] = pts[i], [pb, vb] = pts[i + 1];
      if (p >= pa && p <= pb) return lerp(va, vb, (p - pa) / (pb - pa));
    }
    return pts[pts.length - 1][1];
  }

  const hex = h => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  function mixHex(h1, h2, t) {
    const a = hex(h1), b = hex(h2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(
      lerp(a[1], b[1], t)
    )},${Math.round(lerp(a[2], b[2], t))})`;
  }
  // pulse: 1 at center c, 0 beyond width w
  const pulse = (p, c, w) => clamp(1 - Math.abs(p - c) / w, 0, 1);

  /* ---------- elements ---------- */
  const $ = id => document.getElementById(id);
  const root   = document.documentElement;
  const sky    = $("sky");
  const stars  = $("stars");
  const cFar   = $("cloudsFar");
  const cMid   = $("cloudsMid");
  const cNear  = $("cloudsNear");
  const wind   = $("windfield");
  const plane  = $("plane");
  const rig    = $("rig");
  const diver  = $("diver");
  const canopy = $("canopy");
  const poseFF = $("poseFreefall");
  const poseCP = $("poseCanopy");
  const rain   = $("rain");
  const bolt   = $("lightning");
  const ground = $("ground");
  const dz     = $("dropzone");
  const dust   = $("dust");
  const gforce = $("gforce");
  const flash  = $("flash");
  const altEl  = $("alt");
  const spdEl  = $("spd");
  const phaseEl= $("phase");

  /* ---------- sky gradient stops (by progress) ---------- */
  const SKY = [
    { p: 0.00, t: "#04050d", b: "#142a52" },
    { p: 0.18, t: "#081634", b: "#27538f" },
    { p: 0.42, t: "#123163", b: "#4a86c8" },
    { p: 0.52, t: "#26313f", b: "#566571" }, // storm onset
    { p: 0.68, t: "#1b242f", b: "#414e59" }, // heavy weather
    { p: 0.82, t: "#5a6f93", b: "#a9bdca" }, // clearing
    { p: 1.00, t: "#83b3e6", b: "#dcebdd" }, // ground haze
  ];
  function skyColors(p) {
    let a = SKY[0], b = SKY[SKY.length - 1];
    for (let i = 0; i < SKY.length - 1; i++) {
      if (p >= SKY[i].p && p <= SKY[i + 1].p) { a = SKY[i]; b = SKY[i + 1]; break; }
    }
    const t = inv(p, a.p, b.p);
    return [mixHex(a.t, b.t, t), mixHex(a.b, b.b, t)];
  }

  /* ---------- HUD readouts ---------- */
  const ALT = [[0,14000],[0.10,13600],[0.18,12800],[0.45,5400],
               [0.55,4700],[0.78,1300],[0.90,360],[0.97,40],[1,0]];
  const SPD = [[0,0],[0.12,28],[0.30,120],[0.45,120],[0.50,72],
               [0.55,16],[0.78,15],[0.92,12],[0.97,5],[1,0]];

  /* ---------- weather one-shots ---------- */
  let struck = { a: false, b: false }, dusted = false;
  function strike() {
    bolt.classList.remove("strike");
    void bolt.offsetWidth;
    bolt.classList.add("strike");
  }

  /* ---------- main render ---------- */
  let target = 0, cur = 0;

  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  }

  function render(now) {
    // buttery smoothing toward scroll target
    cur += (target - cur) * 0.12;
    const p = cur;
    root.style.setProperty("--p", p.toFixed(4));

    /* ----- SKY ----- */
    const [st, sb] = skyColors(p);
    root.style.setProperty("--sky-top", st);
    root.style.setProperty("--sky-bot", sb);
    stars.style.opacity = (1 - inv(p, 0.04, 0.20)).toFixed(3);

    // warm horizon glow as we near the ground
    root.style.setProperty("--glow", inv(p, 0.80, 0.99).toFixed(3));

    /* ----- CLOUD PARALLAX (we fall through the decks) ----- */
    const fall = curve(p, [[0,0],[0.18,0.05],[0.45,0.55],[1,1]]);
    cFar.style.transform  = `translate3d(0,${(-fall * 60).toFixed(1)}vh,0)`;
    cMid.style.transform  = `translate3d(0,${(-fall * 130).toFixed(1)}vh,0)`;
    cNear.style.transform = `translate3d(0,${(-fall * 230).toFixed(1)}vh,0)`;
    const clOp = 1 - inv(p, 0.80, 0.95);
    cFar.style.opacity  = (0.45 * clOp).toFixed(3);
    cMid.style.opacity  = (0.70 * clOp).toFixed(3);
    cNear.style.opacity = (0.92 * clOp).toFixed(3);

    /* ----- AIRCRAFT (climbs away after exit) ----- */
    const gone = inv(p, 0.10, 0.21);
    plane.style.opacity = (1 - gone).toFixed(3);
    plane.style.transform =
      `translate(-50%,-50%) translate(${(-gone*44).toFixed(1)}vw,${(-gone*30).toFixed(1)}vh) scale(${(1-gone*0.78).toFixed(3)})`;

    /* ----- DIVER + CANOPY ----- */
    const t = now * 0.001;
    // wind sway grows in the weather band, eases after
    const windAmp = curve(p, [[0,0],[0.20,0.4],[0.55,1.0],[0.72,1.4],
                              [0.86,0.5],[1,0.15]]);
    const swayX = Math.sin(t * 1.6) * 14 * windAmp + Math.sin(t * 0.7) * 6 * windAmp;
    const swayR = Math.sin(t * 1.6 + 0.4) * 6 * windAmp;

    // freefall instability tilt, deploy jolt, then pendulum
    const ffTilt = Math.sin(t * 3.1) * 7 * inv(p, 0.20, 0.45) * (1 - inv(p, 0.42, 0.5));
    const jolt = pulse(p, 0.49, 0.03) * -26; // snatch upward kick
    const settle = smooth(inv(p, 0.86, 1)) * 17; // come down onto the field
    rig.style.transform =
      `translate(-50%,-50%) translate(${swayX.toFixed(1)}px, ${jolt.toFixed(1)}px) translateY(${settle.toFixed(1)}vh)`;
    diver.style.transform = `rotate(${(swayR + ffTilt).toFixed(2)}deg)`;
    // jumper appears as they leave the aircraft
    diver.style.opacity = inv(p, 0.06, 0.15).toFixed(3);

    // pose crossfade at deployment
    const dep = inv(p, 0.455, 0.52);
    poseFF.style.opacity = (1 - dep).toFixed(3);
    poseCP.style.opacity = dep.toFixed(3);

    // canopy unfurl
    const open = inv(p, 0.45, 0.55);
    if (open > 0) {
      const s = easeOutBack(open);
      canopy.style.opacity = clamp(open * 2, 0, 1).toFixed(3);
      canopy.style.transform =
        `translateX(-50%) scale(${(0.02 + s * 0.98).toFixed(3)}) rotate(${(swayR*0.7).toFixed(2)}deg)`;
    } else {
      canopy.style.opacity = "0";
      canopy.style.transform = "translateX(-50%) scale(.02)";
    }

    /* ----- WIND STREAKS (speed lines, peak in freefall) ----- */
    wind.style.opacity = (0.55 * curve(p, [[0.12,0],[0.24,1],[0.43,1],
                                           [0.5,0],[1,0]])).toFixed(3);

    /* ----- WEATHER ----- */
    const wx = curve(p, [[0.50,0],[0.58,1],[0.72,1],[0.82,0],[1,0]]);
    rain.style.opacity = (0.85 * wx).toFixed(3);
    if (p > 0.585 && !struck.a) { struck.a = true; strike(); }
    if (p > 0.685 && !struck.b) { struck.b = true; strike(); }
    if (p < 0.55) { struck.a = struck.b = false; }

    /* ----- GROUND RUSHES UP ----- */
    const land = smooth(inv(p, 0.74, 0.985));
    ground.style.transform = `translateY(${((1 - land) * 100).toFixed(2)}%)`;
    const dzS = lerp(0.35, 3.4, smooth(inv(p, 0.78, 1)));
    dz.style.transform = `translate(-50%,-50%) scale(${dzS.toFixed(3)})`;

    // touchdown dust puff
    if (p > 0.965 && !dusted) {
      dusted = true;
      dust.animate(
        [
          { transform: "translateX(-50%) scale(0)", opacity: 0.9 },
          { transform: "translateX(-50%) scale(14)", opacity: 0 },
        ],
        { duration: 900, easing: "ease-out", fill: "forwards" }
      );
    }
    if (p < 0.94) dusted = false;

    /* ----- CINEMATIC PUNCH ----- */
    root.style.setProperty(
      "--gforce",
      (0.6 * curve(p, [[0.18,0],[0.30,1],[0.43,1],[0.5,0],[1,0]])).toFixed(3)
    );
    // screen shake during canopy snatch
    const shakeAmp = pulse(p, 0.49, 0.045) * 16;
    root.style.setProperty(
      "--shake",
      `${(Math.sin(t * 60) * shakeAmp).toFixed(2)}px`
    );
    // white flash on deploy + on touchdown
    flash.style.opacity = Math.max(
      pulse(p, 0.49, 0.012) * 0.7,
      pulse(p, 0.973, 0.012) * 0.85
    ).toFixed(3);

    /* ----- HUD ----- */
    altEl.textContent = Math.round(curve(p, ALT) / 10) * 10;
    spdEl.textContent = Math.round(curve(p, SPD));
    phaseEl.textContent =
      p < 0.10 ? "Ready" :
      p < 0.18 ? "Exit"  :
      p < 0.45 ? "Freefall" :
      p < 0.55 ? "Deploy" :
      p < 0.74 ? "Weather" :
      p < 0.92 ? "Approach" : "Landed";

    requestAnimationFrame(render);
  }

  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", readScroll);
  readScroll();
  requestAnimationFrame(render);
})();
