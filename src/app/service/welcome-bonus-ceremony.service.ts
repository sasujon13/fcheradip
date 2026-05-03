import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';

/**
 * One-shot “opening ceremony” overlay after signup / first login when the server
 * indicates welcome coins should be celebrated.
 */
@Injectable({ providedIn: 'root' })
export class WelcomeBonusCeremonyService {
  private playing = false;

  constructor(private api: ApiService) {}

  /** Queue celebration to run after the next route navigation (e.g. post-login redirect). */
  schedule(): void {
    sessionStorage.setItem('cheradipPlayWelcomeCeremony', '1');
  }

  /** Call from AppComponent after NavigationEnd (or once on load). */
  tryPlayAfterNavigation(): void {
    if (sessionStorage.getItem('cheradipPlayWelcomeCeremony') !== '1') {
      return;
    }
    sessionStorage.removeItem('cheradipPlayWelcomeCeremony');
    requestAnimationFrame(() => this.playDomCeremony());
  }

  /**
   * Development only: play the overlay immediately (no signup). Visit `/dev/welcome-ceremony`.
   * Does not PATCH customer settings.
   */
  previewForDesign(): void {
    if (environment.production) {
      return;
    }
    requestAnimationFrame(() => this.playDomCeremony({ skipServerClear: true }));
  }

  private clearPendingOnServer(): void {
    if (!localStorage.getItem('authToken')) {
      return;
    }
    this.api
      .updateCustomerSettings({ welcome_coins_ceremony_pending: false })
      .subscribe({ error: () => {} });
  }

  private playDomCeremony(options?: { skipServerClear?: boolean }): void {
    if (this.playing) {
      return;
    }
    this.playing = true;

    const burstSiteCount = 16;
    const debrisPerSite = 12;
    const buildDebrisHtml = (siteIndex: number): string =>
      Array.from({ length: debrisPerSite }, (_, i) => {
        const deg = (360 / debrisPerSite) * i + (i % 3) * 4;
        const hue = (i * 29 + siteIndex * 19) % 360;
        return `<span class="wbc-d" style="--a:${deg}deg;--h:${hue};--i:${i}"></span>`;
      }).join('');
    const burstSiteInnerHtml = (siteIndex: number): string => {
      const debrisHtml = buildDebrisHtml(siteIndex);
      return `<div class="wbc-flash-core"></div>
            <div class="wbc-ring wbc-ring-1"></div>
            <div class="wbc-ring wbc-ring-2"></div>
            <div class="wbc-ring wbc-ring-3"></div>
            <div class="wbc-debris">${debrisHtml}</div>
            <div class="wbc-smoke"></div>`;
    };
    const burstCrownHtml = Array.from({ length: burstSiteCount }, (_, siteIndex) => {
      const spokeDeg = (360 / burstSiteCount) * siteIndex;
      const delay = ((siteIndex * 0.06) % 2.4).toFixed(3);
      return `<div class="wbc-spoke" style="--spoke:${spokeDeg}deg;--site-delay:${delay}s">
          <div class="wbc-burst-axis" aria-hidden="true">${burstSiteInnerHtml(siteIndex)}</div>
        </div>`;
    }).join('');

    /** Petals: rose gradient pairs; each petal uses Math.random() for continuous random drops */
    const rosePairs: ReadonlyArray<readonly [number, number]> = [
      [355, 328], [340, 300], [2, 330], [350, 312], [18, 345],
      [325, 275], [335, 308], [345, 318], [8, 352], [28, 340],
    ];
    const rnd = (): number => Math.random();
    /** Spread each petal to a random phase so loops never “empty” the sky; pair with keyframes that avoid opacity flash at loop reset. */
    const petalCount = 420;
    const petalsHtml = Array.from({ length: petalCount }, (_, i) => {
      const leftPct = rnd() * 100;
      const pair = rosePairs[i % rosePairs.length];
      const h1 = pair[0] + Math.floor(rnd() * 11);
      const h2 = pair[1] + Math.floor(rnd() * 13);
      const durNum = 6.2 + rnd() * 6.5;
      const dur = durNum.toFixed(2);
      const phase = (rnd() * durNum).toFixed(3);
      const r0 = rnd() * 360;
      const sway = -58 + rnd() * 116;
      const y0 = (-10 - rnd() * 14).toFixed(2);
      const rotSpd = 380 + Math.floor(rnd() * 340);
      return `<span class="wbc-petal" style="--left:${leftPct.toFixed(2)}%;--phase:${phase}s;--dur:${dur}s;--r0:${r0.toFixed(2)}deg;--h1:${h1};--h2:${h2};--sway:${sway.toFixed(1)}px;--y0:${y0}vh;--rot-spd:${rotSpd}deg"></span>`;
    }).join('');

    /** One photo per drop; files in `assets/images/welcome-roses/`. */
    const roseImg = {
      red: '/assets/images/welcome-roses/rose-red.png',
      white: '/assets/images/welcome-roses/rose-white.png',
      blue: '/assets/images/welcome-roses/rose-blue.png',
      black: '/assets/images/welcome-roses/rose-black.png',
      yellow: '/assets/images/welcome-roses/rose-yellow.png',
      pink: '/assets/images/welcome-roses/rose-pink.png',
    } as const;
    const roseKinds: (keyof typeof roseImg)[] = [
      'red',
      'white',
      'blue',
      'black',
      'yellow',
      'pink',
    ];
    const roseDropCount = 34;
    const roseDropsHtml = Array.from({ length: roseDropCount }, () => {
      const kind = roseKinds[Math.floor(rnd() * roseKinds.length)]!;
      const src = roseImg[kind];
      const leftPct = rnd() * 100;
      const durNum = 7 + rnd() * 8;
      const dur = durNum.toFixed(2);
      const phase = (rnd() * durNum).toFixed(3);
      const r0 = rnd() * 360;
      const sway = -48 + rnd() * 96;
      const y0 = (-12 - rnd() * 18).toFixed(2);
      const rotSpd = 260 + Math.floor(rnd() * 260);
      const w = (44 + rnd() * 38).toFixed(0);
      return `<img class="wbc-rose-img wbc-ri-${kind}" src="${src}" alt="" draggable="false" style="--left:${leftPct.toFixed(2)}%;--phase:${phase}s;--dur:${dur}s;--r0:${r0.toFixed(2)}deg;--sway:${sway.toFixed(1)}px;--y0:${y0}vh;--rot-spd:${rotSpd}deg;--rw:${w}px"/>`;
    }).join('');

    const root = document.createElement('div');
    root.setAttribute('data-welcome-ceremony', '1');
    root.innerHTML = `
      <div class="wbc-backdrop"></div>
      <div class="wbc-stage">
        <div class="wbc-petal-field" aria-hidden="true">${petalsHtml}${roseDropsHtml}</div>
        <div class="wbc-focus">
          <div class="wbc-burst-crown" aria-hidden="true">${burstCrownHtml}</div>
          <div class="wbc-ambient-glow" aria-hidden="true"></div>
          <div class="wbc-card">
            <div class="wbc-ribbon">✨ Cheradip ✨</div>
            <h1 class="wbc-title">Congratulations!</h1>
            <p class="wbc-sub">You have received <strong>5000 coins</strong> as your welcome bonus!</p>
            <p class="wbc-foot">Your journey with us begins in style — explore, learn, and shine. 🎉</p>
            <div class="wbc-logo-wrap">
              <img src="/assets/images/cheradip.svg" alt="Cheradip" class="wbc-logo" />
            </div>
          </div>
        </div>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      [data-welcome-ceremony]{position:fixed;inset:0;z-index:2147483000;pointer-events:auto;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;}
      [data-welcome-ceremony] .wbc-backdrop{
        position:absolute;inset:0;
        background:
          radial-gradient(circle at 50% 50%,rgba(10,8,22,0.5) 0%,rgba(10,8,22,0.32) 32%,rgba(10,8,22,0.12) 58%,rgba(10,8,22,0) 72%),
          radial-gradient(circle at 50% 50%,rgba(255,245,200,.42) 0%,rgba(80,20,10,.72) 40%,rgba(8,6,24,.96) 78%);
        animation:wbcBackdropIn .35s ease-out both;
      }
      [data-welcome-ceremony] .wbc-stage{
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;
        z-index:1;
      }
      [data-welcome-ceremony] .wbc-focus{
        position:relative;width:min(88vmin,440px);aspect-ratio:1/1;flex-shrink:0;z-index:4;
      }
      [data-welcome-ceremony] .wbc-burst-crown{
        position:absolute;inset:0;border-radius:50%;overflow:visible;z-index:1;pointer-events:none;
      }
      [data-welcome-ceremony] .wbc-spoke{
        position:absolute;left:50%;bottom:50%;width:0;height:50%;
        transform-origin:bottom center;
        transform:translateX(-50%) rotate(var(--spoke,0deg));
        pointer-events:none;
      }
      [data-welcome-ceremony] .wbc-burst-axis{
        position:absolute;left:50%;top:0;width:0;height:0;pointer-events:none;
        transform:translate(-50%,-50%) scale(0.88);
      }
      [data-welcome-ceremony] .wbc-flash-core{
        position:absolute;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;
        background:radial-gradient(circle,#fff 0%,#fde047 35%,#f97316 55%,transparent 68%);
        box-shadow:0 0 40px 20px rgba(255,255,255,.9),0 0 80px 40px rgba(251,191,36,.6);
        animation:wbcCoreCharm 2.8s cubic-bezier(0.25,0.7,0.2,1) infinite;
      }
      [data-welcome-ceremony] .wbc-spoke .wbc-flash-core{animation-delay:var(--site-delay,0s);}
      [data-welcome-ceremony] .wbc-ring{
        position:absolute;left:0;top:0;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;
        border:3px solid rgba(250,204,21,.95);
        animation:wbcRingCharm 2.2s ease-out infinite;
      }
      [data-welcome-ceremony] .wbc-spoke .wbc-ring-1{animation-delay:var(--site-delay,0s);}
      [data-welcome-ceremony] .wbc-ring-2{
        border-color:rgba(20,184,166,.75);animation-delay:0.35s;animation-duration:2.4s;
      }
      [data-welcome-ceremony] .wbc-spoke .wbc-ring-2{
        animation-delay:calc(var(--site-delay, 0s) + 0.35s);animation-duration:2.4s;
      }
      [data-welcome-ceremony] .wbc-ring-3{
        border-color:rgba(244,63,94,.6);border-width:2px;animation-delay:0.65s;animation-duration:2.6s;
      }
      [data-welcome-ceremony] .wbc-spoke .wbc-ring-3{
        animation-delay:calc(var(--site-delay, 0s) + 0.65s);animation-duration:2.6s;
      }
      [data-welcome-ceremony] .wbc-debris{position:absolute;inset:0;width:0;height:0;left:0;top:0;}
      [data-welcome-ceremony] .wbc-d{
        position:absolute;left:0;top:0;width:9px;height:9px;margin:-4px 0 0 -4px;border-radius:2px;
        background:hsl(var(--h,40),90%,55%);
        box-shadow:0 0 6px hsla(var(--h,40),90%,60%,.9);
        transform:rotate(var(--a,0deg)) translate3d(0,0,0);
        animation:wbcShardLoop 3.2s cubic-bezier(0.12,0.65,0.2,1) infinite;
        animation-delay:calc(var(--site-delay, 0s) + var(--i, 0) * 0.045s);
      }
      [data-welcome-ceremony] .wbc-smoke{
        position:absolute;left:0;top:0;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;
        background:radial-gradient(circle,rgba(60,50,40,.5) 0%,transparent 70%);
        filter:blur(12px);
        animation:wbcSmokeCharm 3.5s ease-in-out infinite;
        animation-delay:0.1s;
      }
      [data-welcome-ceremony] .wbc-spoke .wbc-smoke{
        animation-delay:calc(var(--site-delay, 0s) + 0.1s);
      }
      [data-welcome-ceremony] .wbc-ambient-glow{
        position:absolute;left:50%;top:50%;width:min(90vw,480px);height:min(90vw,480px);z-index:2;
        transform:translate(-50%,-50%);
        margin:0;
        border-radius:50%;
        background:conic-gradient(from 0deg,#fbbf24,#f97316,#ec4899,#8b5cf6,#14b8a6,#fbbf24);
        filter:blur(70px);opacity:0.32;animation:wbcAmbient 3.5s ease-in-out infinite;
        pointer-events:none;
      }
      [data-welcome-ceremony] .wbc-petal-field{
        position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:3;
      }
      [data-welcome-ceremony] .wbc-petal{
        position:absolute;left:var(--left,10%);top:-5vh;width:9px;height:14px;margin-left:-4.5px;
        border-radius:60% 60% 40% 40%;
        background:linear-gradient(168deg,hsla(var(--h1,335),76%,76%,.94),hsla(var(--h2,305),68%,48%,.92));
        box-shadow:0 1px 2px rgba(90,35,65,.18);
        opacity:0.9;
        animation:wbcPetalFall var(--dur,8s) linear infinite;
        animation-delay:calc(0.2s - var(--phase,0s));
        transform-origin:50% 70%;
        will-change:transform;
      }
      [data-welcome-ceremony] .wbc-rose-img{
        position:absolute;left:var(--left,50%);top:-10vh;
        width:var(--rw,64px);height:auto;margin-left:calc(var(--rw, 64px) / -2);
        object-fit:contain;pointer-events:none;user-select:none;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.2));
        animation:wbcPetalFall var(--dur,9s) linear infinite;
        animation-delay:calc(0.2s - var(--phase,0s));
        transform-origin:50% 55%;
        will-change:transform;
        opacity:0.95;
      }
      [data-welcome-ceremony] .wbc-ri-white{filter:drop-shadow(0 2px 5px rgba(0,0,0,.35));}
      [data-welcome-ceremony] .wbc-ri-black{filter:drop-shadow(0 0 8px rgba(255,255,255,.22)) drop-shadow(0 2px 4px rgba(0,0,0,.5));}
      [data-welcome-ceremony] .wbc-ri-yellow{filter:drop-shadow(0 2px 5px rgba(80,60,0,.28));}
      [data-welcome-ceremony] .wbc-ri-pink{filter:drop-shadow(0 2px 5px rgba(120,20,60,.22));}
      [data-welcome-ceremony] .wbc-card{
        position:relative;z-index:5;
        width:100%;height:100%;max-width:none;box-sizing:border-box;
        border-radius:50%;overflow:hidden;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;padding:clamp(1rem,3.5vmin,2rem) clamp(1rem,3vmin,1.75rem);
        background:linear-gradient(165deg,#ffffff,#fafafa);
        box-shadow:0 25px 80px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.55) inset,0 0 60px rgba(251,191,36,.15);
        animation:wbcCardPop 0.7s cubic-bezier(0.2,0.9,0.2,1) 0.2s both;
      }
      [data-welcome-ceremony] .wbc-ribbon{font-size:.78rem;letter-spacing:0.28em;text-transform:uppercase;color:#b45309;font-weight:700;margin-bottom:0.75rem;animation:wbcShine 2.2s ease-in-out infinite;
        text-shadow:0 1px 2px rgba(255,255,255,.9),0 2px 10px rgba(0,0,0,.22),0 0 20px rgba(251,191,36,.15);}
      [data-welcome-ceremony] .wbc-title{font-size:clamp(1.6rem,4vw,2.1rem);margin:0 0 0.5rem;
        background:linear-gradient(120deg,#c2410c,#ea580c,#f59e0b,#eab308);
        -webkit-background-clip:text;background-clip:text;color:transparent;animation:wbcTitle 0.9s ease-out 0.25s both;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 1px 2px rgba(255,255,255,.45));}
      [data-welcome-ceremony] .wbc-sub{font-size:1.05rem;line-height:1.55;color:#334155;margin:0 0 0.75rem;
        text-shadow:0 1px 3px rgba(255,255,255,.92),0 2px 8px rgba(0,0,0,.18);}
      [data-welcome-ceremony] .wbc-sub strong{color:#0f766e;font-size:1.15em;text-shadow:0 1px 3px rgba(255,255,255,.85),0 2px 6px rgba(0,0,0,.14);}
      [data-welcome-ceremony] .wbc-foot{font-size:0.9rem;color:#64748b;margin:0 0 0.25rem;
        text-shadow:0 1px 2px rgba(255,255,255,.9),0 2px 8px rgba(0,0,0,.15);}
      [data-welcome-ceremony] .wbc-logo-wrap{
        margin-top:1rem;display:flex;justify-content:center;align-items:center;width:100%;
      }
      [data-welcome-ceremony] .wbc-logo{
        width:75%;max-width:75%;height:auto;display:block;object-fit:contain;
      }
      @keyframes wbcBackdropIn{from{opacity:0}to{opacity:1}}
      @keyframes wbcCoreCharm{
        0%{transform:scale(0.15);opacity:0.55;filter:brightness(1.1);}
        22%{transform:scale(2.1);opacity:1;filter:brightness(1.45);}
        48%{transform:scale(9);opacity:0.42;filter:brightness(1.2);}
        72%{transform:scale(2.8);opacity:0.72;filter:brightness(1.35);}
        100%{transform:scale(0.2);opacity:0.6;filter:brightness(1.1);}
      }
      @keyframes wbcRingCharm{
        0%{transform:scale(0.05);opacity:0.92;}
        100%{transform:scale(16);opacity:0;}
      }
      @keyframes wbcShardLoop{
        0%{transform:rotate(var(--a)) translate3d(0,0,0) scale(1);opacity:0;}
        8%{opacity:1;}
        38%{transform:rotate(var(--a)) translate3d(0,-200px,0) scale(0.22);opacity:0.75;}
        42%{transform:rotate(var(--a)) translate3d(0,0,0) scale(0);opacity:0;}
        100%{opacity:0;}
      }
      @keyframes wbcSmokeCharm{
        0%{transform:scale(0.35);opacity:0.45;}
        40%{transform:scale(2.2);opacity:0.65;}
        100%{transform:scale(3.8);opacity:0.25;}
      }
      @keyframes wbcAmbient{0%,100%{opacity:0.28;transform:rotate(0deg)}50%{opacity:0.42;transform:rotate(180deg)}}
      @keyframes wbcCardPop{0%{opacity:0;transform:scale(0.75) translateY(24px)}100%{opacity:1;transform:scale(1) translateY(0)}}
      @keyframes wbcTitle{from{opacity:0;letter-spacing:0.2em;filter:blur(4px) drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 1px 2px rgba(255,255,255,.45))}to{opacity:1;letter-spacing:normal;filter:blur(0) drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 1px 2px rgba(255,255,255,.45))}}
      @keyframes wbcShine{0%,100%{opacity:0.85}50%{opacity:1;filter:brightness(1.12)}}
      @keyframes wbcPetalFall{
        0%{transform:translate3d(0,var(--y0,-12vh),0) rotate(var(--r0,0deg));opacity:0.9;}
        100%{transform:translate3d(var(--sway,18px),118vh,0) rotate(calc(var(--r0,0deg) + var(--rot-spd,520deg)));opacity:0.55;}
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    /**
     * Three separate `<audio>` elements with fixed `src` (never reassigned) so the browser
     * loads/decode as media — not like navigating to a new URL (which can trigger a save dialog
     * for .wav when Content-Type is wrong). After 1s, play one clip at random; on `ended`, pick
     * another random clip and play (sequential, no overlap).
     */
    const bombTracks = [
      '/assets/sounds/s1.wav',
      '/assets/sounds/s2.wav',
      '/assets/sounds/s3.wav',
    ] as const;
    const bombAudios: HTMLAudioElement[] = bombTracks.map((url) => {
      const a = document.createElement('audio');
      a.preload = 'auto';
      a.src = url;
      a.volume = 0.22;
      return a;
    });

    const onBombTrackEnded = (): void => {
      playRandomBombTrack();
    };

    const playRandomBombTrack = (): void => {
      const next = bombAudios[Math.floor(Math.random() * bombAudios.length)]!;
      for (const a of bombAudios) {
        a.removeEventListener('ended', onBombTrackEnded);
        if (a !== next) {
          a.pause();
          a.currentTime = 0;
        }
      }
      next.addEventListener('ended', onBombTrackEnded);
      next.currentTime = 0;
      void next.play().catch(() => {});
    };

    let bombStartTimer: number | null = window.setTimeout(() => {
      bombStartTimer = null;
      playRandomBombTrack();
    }, 1000);

    const end = () => {
      if (bombStartTimer !== null) {
        clearTimeout(bombStartTimer);
        bombStartTimer = null;
      }
      for (const a of bombAudios) {
        a.removeEventListener('ended', onBombTrackEnded);
        a.pause();
        a.currentTime = 0;
      }
      this.playing = false;
      root.remove();
      style.remove();
      if (!options?.skipServerClear) {
        this.clearPendingOnServer();
      }
    };
    root.addEventListener('click', end);
    let dismissTimer: number | null = window.setTimeout(end, 8500);
    const scheduleDismiss = () => {
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(end, 8500);
    };
    const cardEl = root.querySelector('.wbc-card');
    if (cardEl) {
      cardEl.addEventListener('mouseenter', () => {
        if (dismissTimer) {
          clearTimeout(dismissTimer);
          dismissTimer = null;
        }
      });
      cardEl.addEventListener('mouseleave', () => {
        scheduleDismiss();
      });
    }
  }
}
