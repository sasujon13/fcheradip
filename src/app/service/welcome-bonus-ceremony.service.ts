import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from './api.service';

/** One clip at a time: repeat 201 → 120 → 012 → 201 → … (0=s1, 1=s2, 2=s3). */
const WBC_BOMB_PLAY_ORDER: readonly number[] = [2, 0, 1, 1, 2, 0, 0, 1, 2, 2, 0, 1];

/** If true: hide the ring of bursting flashes around the card; scattered firecrackers + bomb sounds stay. */
const WBC_DISABLE_BURST_CROWN = true;

/**
 * One-shot “opening ceremony” overlay after signup / first login when the server
 * indicates welcome coins should be celebrated.
 */
@Injectable({ providedIn: 'root' })
export class WelcomeBonusCeremonyService {
  private playing = false;

  constructor(
    private api: ApiService,
    private router: Router,
    @Inject(DOCUMENT) private readonly doc: Document,
  ) {}

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
   * Full-screen ceremony from the `/welcome` route (no signup). Clicks do not dismiss;
   * plays until the user navigates to another route (no auto-dismiss). Header stays above
   * the effect area; the ceremony is inset from the top (see CSS).
   * Does not PATCH customer settings.
   */
  playStandaloneWelcomePage(): void {
    requestAnimationFrame(() =>
      this.playDomCeremony({
        skipServerClear: true,
        previewDevPage: true,
        standaloneWelcomeRoute: true,
      }),
    );
  }

  /**
   * Same visuals as `/welcome` (inset below header), plays ~30s or until dismiss click, then navigates.
   * Used after signup/login when the server indicates welcome coins celebration.
   */
  playTimedWelcomeThenNavigate(navigateTo: string): void {
    requestAnimationFrame(() =>
      this.playDomCeremony({
        previewDevPage: true,
        layoutLikeWelcomePage: true,
        navigateWhenFinished: navigateTo,
        dismissAfterMs: 30_000,
      }),
    );
  }

  private clearPendingOnServer(): void {
    if (!localStorage.getItem('authToken')) {
      return;
    }
    this.api
      .updateCustomerSettings({ welcome_coins_ceremony_pending: false })
      .subscribe({ error: () => {} });
  }

  private playDomCeremony(options?: {
    skipServerClear?: boolean;
    /** `/welcome`: black page, no blur scrim, card text fades out, restore page bg on end. */
    previewDevPage?: boolean;
    /** Same inset as `/welcome` (below header). */
    layoutLikeWelcomePage?: boolean;
    /** `/welcome`: do not end the ceremony when clicking the backdrop (signup flow still dismisses on click). */
    standaloneWelcomeRoute?: boolean;
    navigateWhenFinished?: string;
    dismissAfterMs?: number;
  }): void {
    if (this.playing) {
      return;
    }
    this.playing = true;

    const previewDev =
      options?.previewDevPage === true || options?.layoutLikeWelcomePage === true;
    const standaloneWelcome = options?.standaloneWelcomeRoute === true;
    const welcomeInsetLayout =
      options?.layoutLikeWelcomePage === true || options?.standaloneWelcomeRoute === true;
    const navigateWhenFinished = options?.navigateWhenFinished;
    let previewBodyBgStored: string | undefined;
    let previewHtmlBgStored: string | undefined;

    const rnd = (): number => Math.random();

    let burstCrownHtml = '';
    if (!WBC_DISABLE_BURST_CROWN) {
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
      burstCrownHtml = Array.from({ length: burstSiteCount }, (_, siteIndex) => {
        const spokeDeg = (360 / burstSiteCount) * siteIndex;
        const delay = ((siteIndex * 0.06) % 2.4).toFixed(3);
        return `<div class="wbc-spoke" style="--spoke:${spokeDeg}deg;--site-delay:${delay}s">
          <div class="wbc-burst-axis" aria-hidden="true">${burstSiteInnerHtml(siteIndex)}</div>
        </div>`;
      }).join('');
    }

    /** Fewer sites; long `--fc-dur` + keyframe “quiet” tail = rare pops; each burst is richer (ring + sparks + stagger). */
    const firecrackerBurstCount = 14;
    const firecrackerHtml = Array.from({ length: firecrackerBurstCount }, (_, i) => {
      const leftPct = rnd() * 100;
      const topPct = rnd() * 100;
      const scale = 0.48 + rnd() * 1.28;
      const periodNum = 3.5 + rnd() * 2.85;
      const dur = periodNum.toFixed(3);
      const delay = (i * 0.62 + rnd() * 5.5).toFixed(3);
      const hueBase = Math.floor(rnd() * 360);
      const nSparks = 18 + Math.floor(rnd() * 12);
      const sparks = Array.from({ length: nSparks }, (_, j) => {
        const ang = (360 / nSparks) * j + rnd() * 22 - 11;
        const len = (36 + rnd() * 132).toFixed(1);
        const sh = Math.floor((hueBase + j * 17 + rnd() * 40) % 360);
        const sd = (j * 0.014 + rnd() * 0.055).toFixed(3);
        const sw = (2.2 + rnd() * 3.8).toFixed(2);
        return `<span class="wbc-fc-spark" style="--a:${ang.toFixed(2)}deg;--len:${len}px;--sh:${sh};--sd:${sd}s;--sw:${sw}px"></span>`;
      }).join('');
      return `<div class="wbc-fc-burst" style="--fc-left:${leftPct.toFixed(2)}%;--fc-top:${topPct.toFixed(2)}%;--fc-scale:${scale.toFixed(3)};--fc-delay:${delay}s;--fc-dur:${dur}s"><span class="wbc-fc-core" aria-hidden="true"></span><span class="wbc-fc-flash" aria-hidden="true"></span><span class="wbc-fc-ring" aria-hidden="true"></span><div class="wbc-fc-sparks">${sparks}</div></div>`;
    }).join('');

    /** Petals: rose gradient pairs; each petal uses Math.random() for continuous random drops */
    const rosePairs: ReadonlyArray<readonly [number, number]> = [
      [355, 328], [340, 300], [2, 330], [350, 312], [18, 345],
      [325, 275], [335, 308], [345, 318], [8, 352], [28, 340],
    ];
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
      return `<img class="wbc-rose-img wbc-ri-${kind}" src="${src}" alt="" draggable="false" style="--left:${leftPct.toFixed(2)}%;--phase:${phase}s;--dur:${dur}s;--r0:${r0.toFixed(2)}deg;--sway:${sway.toFixed(1)}px;--y0:${y0}vh;--rot-spd:${rotSpd}deg"/>`;
    }).join('');

    const root = document.createElement('div');
    root.setAttribute('data-welcome-ceremony', '1');
    if (previewDev) {
      root.setAttribute('data-wbc-preview', '1');
    }
    if (welcomeInsetLayout) {
      root.setAttribute('data-wbc-standalone-welcome', '1');
    }
    root.innerHTML = `
      <div class="wbc-dismiss-layer" aria-hidden="true"></div>
      <div class="wbc-stage">
        <div class="wbc-petal-field" aria-hidden="true">${petalsHtml}${roseDropsHtml}</div>
        <div class="wbc-firecracker-field" aria-hidden="true">${firecrackerHtml}</div>
        <div class="wbc-focus">
          <div class="wbc-burst-crown" aria-hidden="true">${burstCrownHtml}</div>
          <div class="wbc-ambient-glow" aria-hidden="true"></div>
          <div class="wbc-card">
            <div class="wbc-card-front">
              <div class="wbc-ribbon">✨ Cheradip ✨</div>
              <h1 class="wbc-title">Congratulations!</h1>
              <p class="wbc-intro-line">You have received</p>
              <p class="wbc-coins">5000 Coins</p>
              <p class="wbc-copy-black">as your welcome bonus! Your journey with us begins in style — explore, learn, and shine. 🎉</p>
              <div class="wbc-logo-wrap">
                <img src="/assets/images/cheradip.svg" alt="Cheradip" class="wbc-logo" />
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      [data-welcome-ceremony]{
        position:fixed;top:0;left:0;right:0;bottom:0;width:100%;min-height:100vh;min-height:100dvh;
        z-index:2147483647;pointer-events:auto;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;
        box-sizing:border-box;isolation:isolate;
      }
      [data-welcome-ceremony][data-wbc-preview="1"]{
        background:#000;
      }
      /* /welcome: below fixed header (z-index 9999); ceremony fills viewport under 60px top band */
      [data-welcome-ceremony][data-wbc-preview="1"][data-wbc-standalone-welcome="1"]{
        top:60px;
        bottom:0;
        height:auto;
        min-height:calc(100vh - 60px);
        min-height:calc(100dvh - 60px);
        z-index:9998;
      }
      [data-welcome-ceremony][data-wbc-standalone-welcome="1"] .wbc-dismiss-layer,
      [data-welcome-ceremony][data-wbc-standalone-welcome="1"] .wbc-stage,
      [data-welcome-ceremony][data-wbc-standalone-welcome="1"] .wbc-petal-field,
      [data-welcome-ceremony][data-wbc-standalone-welcome="1"] .wbc-firecracker-field{
        min-height:100% !important;
        height:100% !important;
      }
      [data-welcome-ceremony][data-wbc-preview="1"] .wbc-dismiss-layer{
        display:none !important;
        opacity:0 !important;
        visibility:hidden !important;
        pointer-events:none !important;
        backdrop-filter:none !important;
        -webkit-backdrop-filter:none !important;
      }
      /* Black preview bg: light copy (default #000 text would vanish). */
      [data-welcome-ceremony][data-wbc-preview="1"] .wbc-intro-line,
      [data-welcome-ceremony][data-wbc-preview="1"] .wbc-copy-black{
        color:#e2e8f0;
      }
      /* Avoid rotating conic “blob” and small square debris glitches on dev preview. */
      [data-welcome-ceremony][data-wbc-preview="1"] .wbc-ambient-glow{
        display:none !important;
      }
      [data-welcome-ceremony][data-wbc-preview="1"] .wbc-debris,
      [data-welcome-ceremony][data-wbc-preview="1"] .wbc-d{
        display:none !important;
      }
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-petal-field,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-firecracker-field,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-burst-crown,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-ambient-glow,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-petal-field,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-firecracker-field,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-burst-crown,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-ambient-glow{
        opacity:0;visibility:hidden;pointer-events:none;
        animation-play-state:paused;
      }
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-petal,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-rose-img,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-petal,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-rose-img{
        animation-play-state:paused;
      }
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-burst-crown *,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-ambient-glow,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-firecracker-field,
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-firecracker-field *,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-burst-crown *,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-ambient-glow,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-firecracker-field,
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-firecracker-field *{
        animation-play-state:paused !important;
      }
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-burst-crown *,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-ambient-glow,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-firecracker-field,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-firecracker-field *{
        animation-play-state:running !important;
      }
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-petal-field,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-firecracker-field,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-burst-crown,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-ambient-glow{
        opacity:1;visibility:visible;
        animation-play-state:running;
      }
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-petal,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-rose-img{
        animation-play-state:running;
      }
      /* Scrim: fixed gradient + blur always; only opacity animates (avoids backdrop/gradient tween glitches + “shifting” dim). */
      [data-welcome-ceremony] .wbc-dismiss-layer{
        position:absolute;inset:0;width:100%;height:100%;min-height:100vh;min-height:100dvh;
        z-index:0;pointer-events:auto;
        background:radial-gradient(ellipse 115% 95% at 50% 42%,rgba(30,22,48,0.38) 0%,rgba(12,8,24,0.72) 52%,rgba(6,4,14,0.88) 100%);
        backdrop-filter:saturate(1.1) blur(5px);
        -webkit-backdrop-filter:saturate(1.1) blur(5px);
        transform:translateZ(0);
        opacity:0;
        transition:opacity 0.48s ease;
      }
      [data-welcome-ceremony][data-wbc-phase="text"] .wbc-dismiss-layer{
        opacity:0;
      }
      [data-welcome-ceremony][data-wbc-phase="overlay"] .wbc-dismiss-layer,
      [data-welcome-ceremony][data-wbc-phase="fx"] .wbc-dismiss-layer{
        opacity:1;
      }
      [data-welcome-ceremony] .wbc-stage{
        position:absolute;inset:0;width:100%;height:100%;min-height:100vh;min-height:100dvh;
        display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 24px 24px;
        z-index:1;box-sizing:border-box;pointer-events:none;
      }
      [data-welcome-ceremony] .wbc-focus{
        position:relative;flex:0 0 auto;isolation:isolate;pointer-events:none;
        width:min(88vmin,440px);height:min(88vmin,440px);min-width:min(88vmin,440px);min-height:min(88vmin,440px);
        max-width:min(88vmin,440px);max-height:min(88vmin,440px);
        z-index:10;
        transform:translateZ(0);
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
        position:absolute;inset:0;width:100%;height:100%;min-height:100vh;min-height:100dvh;
        overflow:hidden;pointer-events:none;z-index:1;
      }
      [data-welcome-ceremony] .wbc-firecracker-field{
        position:absolute;inset:0;width:100%;height:100%;min-height:100vh;min-height:100dvh;
        overflow:hidden;pointer-events:none;z-index:3;
      }
      [data-welcome-ceremony] .wbc-fc-burst{
        position:absolute;left:var(--fc-left,50%);top:var(--fc-top,50%);width:0;height:0;
        transform:translate(-50%,-50%) scale(var(--fc-scale,1));
        transform-origin:center center;pointer-events:none;
      }
      [data-welcome-ceremony] .wbc-fc-core{
        position:absolute;left:0;top:0;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;
        background:radial-gradient(circle at 32% 30%,#fff 0%,#fff7c2 22%,#fbbf24 42%,#ea580c 62%,transparent 78%);
        box-shadow:0 0 18px 8px rgba(255,248,220,.88),0 0 48px 18px rgba(251,146,60,.45),0 0 72px 28px rgba(234,88,12,.22);
        animation:wbcFcCore var(--fc-dur,4s) cubic-bezier(0.2,0.9,0.2,1) infinite;
        animation-delay:var(--fc-delay,0s);
        will-change:transform,opacity,filter;
      }
      [data-welcome-ceremony] .wbc-fc-flash{
        position:absolute;left:0;top:0;width:140px;height:140px;margin:-70px 0 0 -70px;border-radius:50%;
        background:radial-gradient(circle at 45% 42%,rgba(255,255,255,.92) 0%,rgba(254,243,199,.55) 14%,rgba(251,191,36,.28) 32%,transparent 58%);
        filter:blur(3px);
        animation:wbcFcFlash var(--fc-dur,4s) ease-out infinite;
        animation-delay:var(--fc-delay,0s);
        will-change:transform,opacity;
      }
      [data-welcome-ceremony] .wbc-fc-ring{
        position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        border:2px solid rgba(255,237,160,.88);
        box-shadow:0 0 10px rgba(255,200,80,.55);
        animation:wbcFcRing var(--fc-dur,4s) cubic-bezier(0.15,0.85,0.2,1) infinite;
        animation-delay:var(--fc-delay,0s);
        will-change:transform,opacity;
      }
      [data-welcome-ceremony] .wbc-fc-sparks{
        position:absolute;left:0;top:0;width:0;height:0;transform:translate(0,0);
      }
      [data-welcome-ceremony] .wbc-fc-spark{
        position:absolute;left:0;top:0;width:var(--sw,4px);height:calc(var(--sw, 4px) * 1.55);margin:calc(-0.5 * var(--sw, 4px)) 0 0 calc(-0.5 * var(--sw, 4px));border-radius:40%;
        background:linear-gradient(180deg,hsl(var(--sh,48),100%,72%) 0%,hsl(calc(var(--sh,48) + 22),92%,52%) 55%,hsl(calc(var(--sh,48) + 44),85%,38%) 100%);
        box-shadow:0 0 10px 3px hsla(var(--sh,48),100%,62%,.75),0 0 2px 1px rgba(255,255,255,.35);
        transform:rotate(var(--a,0deg)) translate3d(0,0,0);
        animation:wbcFcSpark var(--fc-dur,4s) cubic-bezier(0.08,0.72,0.18,1) infinite;
        animation-delay:calc(var(--fc-delay, 0s) + var(--sd, 0s));
        will-change:transform,opacity;
      }
      @keyframes wbcFcCore{
        0%,68%{transform:scale(0.06);opacity:0;filter:brightness(1);}
        71%{opacity:0.95;}
        76%{transform:scale(1.05);opacity:1;filter:brightness(1.55);}
        86%{transform:scale(5.8);opacity:0.88;filter:brightness(1.22);}
        93%,100%{transform:scale(0.04);opacity:0;filter:brightness(1);}
      }
      @keyframes wbcFcFlash{
        0%,66%{transform:scale(0.04);opacity:0;}
        72%{opacity:0.88;}
        84%{transform:scale(1.05);opacity:0.5;}
        94%,100%{transform:scale(1.25);opacity:0;}
      }
      @keyframes wbcFcRing{
        0%,67%{transform:scale(0.15);opacity:0;}
        74%{opacity:0.95;}
        92%{transform:scale(12);opacity:0.08;}
        98%,100%{transform:scale(14);opacity:0;}
      }
      @keyframes wbcFcSpark{
        0%,66%{opacity:0;transform:rotate(var(--a,0deg)) translate3d(0,0,0) scale(0.85);}
        72%{opacity:1;}
        91%{opacity:0.45;transform:rotate(var(--a,0deg)) translate3d(0,calc(-1 * var(--len,88px)),0) scale(0.35);}
        97%,100%{opacity:0;transform:rotate(var(--a,0deg)) translate3d(0,calc(-1 * var(--len,88px)),0) scale(0.12);}
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
        width:auto;height:auto;margin:0;
        object-fit:contain;pointer-events:none;user-select:none;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.2));
        animation:wbcRoseFall var(--dur,9s) linear infinite;
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
        position:relative;z-index:100;
        width:100%;height:100%;max-width:none;box-sizing:border-box;
        border:none;outline:none;border-radius:50%;overflow:visible;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;padding:clamp(1rem,3.5vmin,2rem) clamp(1rem,3vmin,1.75rem);
        pointer-events:auto;
        background:transparent;
        box-shadow:none;
        animation:wbcCardPop 0.65s cubic-bezier(0.2,0.9,0.2,1) 0s both;
        transform:translateZ(2px);
      }
      [data-welcome-ceremony] .wbc-card-front{
        position:relative;z-index:101;isolation:isolate;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;width:100%;pointer-events:auto;
        transform:translateZ(3px);
      }
      [data-welcome-ceremony] .wbc-ribbon{font-size:calc(0.78rem + 8px);letter-spacing:0.28em;text-transform:uppercase;color:#b45309;font-weight:700;margin-bottom:0.75rem;animation:wbcShine 2.2s ease-in-out infinite;
        text-shadow:0 1px 2px rgba(255,255,255,.9),0 2px 10px rgba(0,0,0,.22),0 0 20px rgba(251,191,36,.15);}
      [data-welcome-ceremony] .wbc-title{font-size:clamp(calc(1.6rem + 8px),calc(4vw + 8px),calc(2.1rem + 8px));margin:0 0 0.5rem;
        background:linear-gradient(120deg,#c2410c,#ea580c,#f59e0b,#eab308);
        -webkit-background-clip:text;background-clip:text;color:transparent;animation:wbcTitle 0.9s ease-out 0.25s both;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 1px 2px rgba(255,255,255,.45));}
      [data-welcome-ceremony] .wbc-intro-line{
        margin:0 0 0.35rem;font-size:calc(1.05rem + 8px);line-height:1.55;color:#000;text-align:center;
      }
      [data-welcome-ceremony] .wbc-coins{
        margin:0 0 0.35rem;
        font-size:clamp(calc(1.38rem + 8px),calc(3.4vw + 10px),calc(2rem + 10px));
        font-weight:700;line-height:1.28;white-space:nowrap;text-align:center;
        background:linear-gradient(120deg,#c2410c,#ea580c,#f59e0b,#eab308);
        -webkit-background-clip:text;background-clip:text;color:transparent;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.35)) drop-shadow(0 1px 2px rgba(255,255,255,.45));
      }
      [data-welcome-ceremony] .wbc-copy-black{
        margin:0 0 0.5rem;font-size:calc(1.05rem + 8px);line-height:1.55;color:#000;
        text-align:center;
      }
      [data-welcome-ceremony] .wbc-logo-wrap{
        margin-top:1rem;display:flex;justify-content:center;align-items:center;width:100%;
      }
      [data-welcome-ceremony] .wbc-logo{
        width:75%;max-width:75%;height:auto;display:block;object-fit:contain;
      }
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
      /* Photo roses: intrinsic bitmap size + translateX(-50%) centered on horizontal --left %. */
      @keyframes wbcRoseFall{
        0%{transform:translateX(-50%) translate3d(0,var(--y0,-12vh),0) rotate(var(--r0,0deg));opacity:0.95;}
        100%{transform:translateX(-50%) translate3d(var(--sway,18px),118vh,0) rotate(calc(var(--r0,0deg) + var(--rot-spd,520deg)));opacity:0.55;}
      }
    `;
    document.head.appendChild(style);
    if (previewDev) {
      previewBodyBgStored = this.doc.body.style.backgroundColor;
      previewHtmlBgStored = this.doc.documentElement.style.backgroundColor;
      this.doc.body.style.backgroundColor = '#000';
      this.doc.documentElement.style.backgroundColor = '#000';
    }
    document.body.appendChild(root);
    /** `text` → copy first; `overlay` → dim scrim; `fx` → petals, crackers, crown, audio. */
    root.setAttribute('data-wbc-phase', 'text');

    /**
     * One `<audio>` + blob URLs (WAV/MP3/…). Loads `welcome-bomb.bundle.json` first (one GET; build via
     * `npm run pack-welcome-sounds`) so s1–s3 are not requested as separate asset URLs on hosts that
     * force download for those paths. Order: 201 → 120 → 012 → 201 → repeat.
     */
    const bombLoadAbort = new AbortController();
    const bombBlobUrls: (string | null)[] = [null, null, null];
    const bombEl = document.createElement('audio');
    bombEl.preload = 'auto';
    bombEl.setAttribute('playsinline', '');
    bombEl.volume = 0.5;
    bombEl.setAttribute('data-wbc-bomb-audio', '1');
    Object.assign(bombEl.style, {
      position: 'absolute',
      width: '0',
      height: '0',
      opacity: '0',
      pointerEvents: 'none',
    });
    root.appendChild(bombEl);
    let bombPlaylistPos = 0;
    let bombEndedListener: (() => void) | null = null;
    let bombTimeUpdateListener: (() => void) | null = null;
    /** Seconds before natural end to cut to the next clip (s1/s2: 1s; s3: 2s). */
    const bombSkipTailSecForTrack = (track: number): number => (track === 2 ? 2 : 1);
    let bombBlobsReady = false;
    let bombFxWanted = false;
    let bombPlaylistStarted = false;
    /** Chrome autoplay: remove listeners registered when `play()` was blocked. */
    let bombAutoplayUnlockTeardown: (() => void) | null = null;

    const clearBombAutoplayUnlock = (): void => {
      if (bombAutoplayUnlockTeardown) {
        bombAutoplayUnlockTeardown();
        bombAutoplayUnlockTeardown = null;
      }
    };

    const detachBombAdvanceListeners = (): void => {
      if (bombEndedListener !== null) {
        bombEl.removeEventListener('ended', bombEndedListener);
      }
      if (bombTimeUpdateListener !== null) {
        bombEl.removeEventListener('timeupdate', bombTimeUpdateListener);
      }
      bombEndedListener = null;
      bombTimeUpdateListener = null;
    };

    const stopAllBombAudio = (): void => {
      clearBombAutoplayUnlock();
      bombLoadAbort.abort();
      detachBombAdvanceListeners();
      bombEl.pause();
      bombEl.removeAttribute('src');
      bombEl.load();
      bombBlobUrls.forEach((u) => {
        if (u) {
          URL.revokeObjectURL(u);
        }
      });
      bombBlobUrls[0] = bombBlobUrls[1] = bombBlobUrls[2] = null;
    };

    const advanceBombPlaylist = (): void => {
      bombPlaylistPos += 1;
      if (bombPlaylistPos >= WBC_BOMB_PLAY_ORDER.length) {
        bombPlaylistPos = 0;
      }
    };

    const tryStartBombPlaylist = (): void => {
      if (bombPlaylistStarted || !bombBlobsReady || !bombFxWanted || !root.isConnected) {
        return;
      }
      bombPlaylistStarted = true;
      bombPlaylistPos = 0;
      playCurrentBombClip();
    };

    const isLikelyAutoplayDenial = (err: unknown): boolean => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        return true;
      }
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : '';
      return /not allowed|user didn'?t interact|user gesture|must be (resumed|started)|autoplay policy/i.test(
        msg,
      );
    };

    const playCurrentBombClip = (): void => {
      if (!root.isConnected || !bombPlaylistStarted) {
        return;
      }
      if (!bombBlobUrls.some((u) => u != null)) {
        return;
      }
      for (let skip = 0; skip < WBC_BOMB_PLAY_ORDER.length + 2; skip++) {
        if (bombPlaylistPos >= WBC_BOMB_PLAY_ORDER.length) {
          bombPlaylistPos = 0;
        }
        const track = WBC_BOMB_PLAY_ORDER[bombPlaylistPos]!;
        const blobUrl = bombBlobUrls[track];
        if (!blobUrl) {
          advanceBombPlaylist();
          continue;
        }

        const skipTailSec = bombSkipTailSecForTrack(track);
        let bombGoNextArmed = true;
        const goNextBombClip = (): void => {
          if (!bombGoNextArmed) {
            return;
          }
          bombGoNextArmed = false;
          detachBombAdvanceListeners();
          bombEl.pause();
          advanceBombPlaylist();
          playCurrentBombClip();
        };

        detachBombAdvanceListeners();
        bombEl.pause();
        if (bombEl.src !== blobUrl) {
          bombEl.src = blobUrl!;
          bombEl.load();
        }
        bombEl.currentTime = 0;

        const onBombTimeUpdate = (): void => {
          const d = bombEl.duration;
          if (!Number.isFinite(d) || d <= skipTailSec + 0.05) {
            return;
          }
          if (bombEl.currentTime >= d - skipTailSec) {
            goNextBombClip();
          }
        };
        bombTimeUpdateListener = onBombTimeUpdate;
        bombEl.addEventListener('timeupdate', onBombTimeUpdate);

        bombEndedListener = (): void => {
          goNextBombClip();
        };
        bombEl.addEventListener('ended', bombEndedListener, { once: true });

        /**
         * Timer-started playback: try muted-first (some browsers allow it).
         */
        const startBombPlaybackAutoplay = (): void => {
          /** Chrome allows muted autoplay without a tap; unmute after decode starts (double rAF avoids silent glitch). */
          const unmuteWhenPlaying = (): void => {
            bombEl.removeEventListener('playing', unmuteWhenPlaying);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                bombEl.muted = false;
                bombEl.volume = 0.5;
              });
            });
          };
          bombEl.addEventListener('playing', unmuteWhenPlaying, { once: true });
          bombEl.volume = 0.5;
          bombEl.muted = true;
          void bombEl.play().catch((err: unknown) => {
            bombEl.removeEventListener('playing', unmuteWhenPlaying);
            bombEl.muted = false;
            if (!root.isConnected || !bombPlaylistStarted) {
              return;
            }
            if (!isLikelyAutoplayDenial(err)) {
              detachBombAdvanceListeners();
              advanceBombPlaylist();
              playCurrentBombClip();
              return;
            }
            clearBombAutoplayUnlock();
            const onGesture = (): void => {
              clearBombAutoplayUnlock();
              if (!root.isConnected || !bombPlaylistStarted) {
                return;
              }
              startBombPlaybackAutoplay();
            };
            window.addEventListener('pointerdown', onGesture, { passive: true, capture: true });
            window.addEventListener('touchend', onGesture, { passive: true, capture: true });
            window.addEventListener('keydown', onGesture, { capture: true });
            bombAutoplayUnlockTeardown = (): void => {
              window.removeEventListener('pointerdown', onGesture, { capture: true });
              window.removeEventListener('touchend', onGesture, { capture: true });
              window.removeEventListener('keydown', onGesture, { capture: true });
            };
          });
        };

        startBombPlaybackAutoplay();
        return;
      }
    };

    void (async (): Promise<void> => {
      if (bombLoadAbort.signal.aborted || !root.isConnected) {
        return;
      }
      try {
        await this.loadWelcomeBombBlobSlots(bombLoadAbort.signal, bombBlobUrls);
      } catch {
        return;
      }
      if (!root.isConnected || bombLoadAbort.signal.aborted) {
        return;
      }
      bombBlobsReady = true;
      tryStartBombPlaylist();
    })();

    const WBC_TEXT_MS = 420;
    const WBC_OVERLAY_BEFORE_FX_MS = 680;
    /** Auto-close after this long (card hover pauses the timer; signup also dismisses on click). */
    const WBC_AUTO_DISMISS_MS = 30_000;
    let overlayRevealTimer: number | null = window.setTimeout(() => {
      overlayRevealTimer = null;
      root.setAttribute('data-wbc-phase', 'overlay');
    }, WBC_TEXT_MS);
    let fxRevealTimer: number | null = window.setTimeout(() => {
      fxRevealTimer = null;
      root.setAttribute('data-wbc-phase', 'fx');
      bombFxWanted = true;
      tryStartBombPlaylist();
    }, WBC_TEXT_MS + WBC_OVERLAY_BEFORE_FX_MS);

    let navTeardown: (() => void) | undefined;
    let ceremonyEnded = false;

    const end = () => {
      if (ceremonyEnded) {
        return;
      }
      ceremonyEnded = true;
      navTeardown?.();
      navTeardown = undefined;
      if (overlayRevealTimer !== null) {
        clearTimeout(overlayRevealTimer);
        overlayRevealTimer = null;
      }
      if (fxRevealTimer !== null) {
        clearTimeout(fxRevealTimer);
        fxRevealTimer = null;
      }
      stopAllBombAudio();
      this.playing = false;
      root.remove();
      style.remove();
      if (previewDev) {
        if (previewBodyBgStored !== undefined) {
          this.doc.body.style.backgroundColor = previewBodyBgStored;
        }
        if (previewHtmlBgStored !== undefined) {
          this.doc.documentElement.style.backgroundColor = previewHtmlBgStored;
        }
      }
      if (!options?.skipServerClear) {
        this.clearPendingOnServer();
      }
      if (navigateWhenFinished) {
        void this.router.navigateByUrl(navigateWhenFinished);
      }
    };
    if (!standaloneWelcome) {
      root.addEventListener('click', end);
    }
    const dismissMsNonStandalone = (): number => {
      if (typeof options?.dismissAfterMs === 'number') {
        return options.dismissAfterMs;
      }
      return WBC_AUTO_DISMISS_MS;
    };
    let dismissTimer: number | null = standaloneWelcome
      ? null
      : window.setTimeout(end, dismissMsNonStandalone());
    const scheduleDismiss = (): void => {
      if (standaloneWelcome) {
        return;
      }
      if (dismissTimer) {
        clearTimeout(dismissTimer);
      }
      dismissTimer = window.setTimeout(end, dismissMsNonStandalone());
    };
    const cardEl = root.querySelector('.wbc-card');
    if (cardEl && !standaloneWelcome) {
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
    if (standaloneWelcome) {
      const sub = this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe(() => {
          const path = this.router.url.split(/[?#]/)[0];
          if (path !== '/welcome') {
            end();
          }
        });
      navTeardown = (): void => sub.unsubscribe();
    }
  }

  private resolveAssetUrl(relativePath: string): string {
    const normalized = relativePath.replace(/^\//, '');
    const baseEl = this.doc.querySelector('base');
    const base = baseEl?.href ?? this.doc.defaultView?.location.href ?? '/';
    return new URL(normalized, base).href;
  }

  private looksLikeWavBytes(buf: ArrayBuffer): boolean {
    if (buf.byteLength < 12) {
      return false;
    }
    const u = new Uint8Array(buf);
    return u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46;
  }

  /** MIME for `<audio>` blob URLs from magic bytes; null if unknown. */
  private guessAudioMimeFromBuffer(buf: ArrayBuffer): string | null {
    if (buf.byteLength < 4) {
      return null;
    }
    const u = new Uint8Array(buf);
    if (this.looksLikeWavBytes(buf)) {
      return 'audio/wav';
    }
    /** Ogg (Vorbis/Opus) */
    if (u[0] === 0x4f && u[1] === 0x67 && u[2] === 0x67 && u[3] === 0x53) {
      return 'audio/ogg';
    }
    /** WebM / Matroska (EBML) — often Opus/A-Vorbis */
    if (u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) {
      return 'audio/webm';
    }
    /** Core Audio Format */
    if (u[0] === 0x63 && u[1] === 0x61 && u[2] === 0x66 && u[3] === 0x66) {
      return 'audio/x-caf';
    }
    /** AIFF */
    if (
      u[0] === 0x46 &&
      u[1] === 0x4f &&
      u[2] === 0x52 &&
      u[3] === 0x4d &&
      buf.byteLength >= 12 &&
      u[8] === 0x41 &&
      u[9] === 0x49 &&
      u[10] === 0x46 &&
      u[11] === 0x46
    ) {
      return 'audio/aiff';
    }
    if (u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) {
      return 'audio/mpeg';
    }
    if (u[0] === 0xff && (u[1] & 0xe0) === 0xe0) {
      return 'audio/mpeg';
    }
    /** MP4/M4A: `ftyp` usually at 4; scan in case of leading atom */
    const scan = Math.min(u.length - 8, 4096);
    for (let i = 4; i <= scan; i++) {
      if (u[i] === 0x66 && u[i + 1] === 0x74 && u[i + 2] === 0x79 && u[i + 3] === 0x70) {
        return 'audio/mp4';
      }
    }
    return null;
  }

  private base64ToArrayBuffer(b64: string): ArrayBuffer | null {
    const t = b64.trim();
    if (!t) {
      return null;
    }
    try {
      const bin = atob(t);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }

  private fillBombSlotFromBytes(ab: ArrayBuffer, idx: number, out: (string | null)[]): void {
    const mime = this.guessAudioMimeFromBuffer(ab);
    if (!mime) {
      return;
    }
    if (out[idx]) {
      URL.revokeObjectURL(out[idx]!);
    }
    out[idx] = URL.createObjectURL(new Blob([ab], { type: mime }));
  }

  /**
   * Prefer one JSON bundle (see `npm run pack-welcome-sounds`) so s1/s2/s3 are not
   * requested as separate asset URLs (some hosts attach those and trigger downloads).
   * Fetches individual files only for slots still empty; skips bodies with unknown format.
   */
  private async loadWelcomeBombBlobSlots(
    signal: AbortSignal,
    out: (string | null)[],
  ): Promise<void> {
    try {
      const bundleRes = await fetch(this.resolveAssetUrl('assets/sounds/welcome-bomb.bundle.json'), {
        signal,
      });
      if (bundleRes.ok) {
        const j = (await bundleRes.json()) as { s1?: string; s2?: string; s3?: string };
        const slots: [number, 's1' | 's2' | 's3'][] = [
          [0, 's1'],
          [1, 's2'],
          [2, 's3'],
        ];
        for (const [idx, key] of slots) {
          const raw = j[key];
          if (typeof raw !== 'string') {
            continue;
          }
          const ab = this.base64ToArrayBuffer(raw);
          if (!ab) {
            continue;
          }
          this.fillBombSlotFromBytes(ab, idx, out);
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
      }
    }

    const paths = ['assets/sounds/s1.wav', 'assets/sounds/s2.wav', 'assets/sounds/s3.wav'];
    for (let i = 0; i < paths.length; i++) {
      if (out[i] || signal.aborted) {
        continue;
      }
      try {
        const res = await fetch(this.resolveAssetUrl(paths[i]!), { signal });
        if (!res.ok) {
          continue;
        }
        const ab = await res.arrayBuffer();
        this.fillBombSlotFromBytes(ab, i, out);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw e;
        }
      }
    }
  }
}
