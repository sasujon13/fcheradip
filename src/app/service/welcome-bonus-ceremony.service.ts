import { Injectable } from '@angular/core';
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

  private clearPendingOnServer(): void {
    if (!localStorage.getItem('authToken')) {
      return;
    }
    this.api
      .updateCustomerSettings({ welcome_coins_ceremony_pending: false })
      .subscribe({ error: () => {} });
  }

  private playDomCeremony(): void {
    if (this.playing) {
      return;
    }
    this.playing = true;
    const root = document.createElement('div');
    root.setAttribute('data-welcome-ceremony', '1');
    root.innerHTML = `
      <div class="wbc-backdrop"></div>
      <div class="wbc-stage">
        <div class="wbc-confetti" aria-hidden="true"></div>
        <div class="wbc-glow"></div>
        <div class="wbc-card">
          <div class="wbc-ribbon">✨ Cheradip ✨</div>
          <h1 class="wbc-title">Congratulations!</h1>
          <p class="wbc-sub">You have received <strong>5000 coins</strong> as your welcome bonus!</p>
          <p class="wbc-foot">Your journey with us begins in style — explore, learn, and shine. 🎉</p>
        </div>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      [data-welcome-ceremony]{position:fixed;inset:0;z-index:2147483000;pointer-events:auto;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,sans-serif;}
      [data-welcome-ceremony] .wbc-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 50% 20%,rgba(255,236,180,.35),rgba(10,8,30,.88));animation:wbcFade .6s ease-out both;}
      [data-welcome-ceremony] .wbc-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;}
      [data-welcome-ceremony] .wbc-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
      [data-welcome-ceremony] .wbc-confetti::before,[data-welcome-ceremony] .wbc-confetti::after{
        content:"";position:absolute;width:120%;height:8px;left:-10%;top:-20%;
        background:repeating-linear-gradient(90deg,#f9d423 0 14px,#ff4e50 14px 28px,#36d1dc 28px 42px,#a78bfa 42px 56px,#f472b6 56px 70px,#34d399 70px 84px);
        opacity:.85;animation:wbcConfettiFall 4.2s linear infinite;
        transform:rotate(12deg);
      }
      [data-welcome-ceremony] .wbc-confetti::after{animation-delay:-2.1s;transform:rotate(-8deg);opacity:.65;top:-10%;}
      [data-welcome-ceremony] .wbc-glow{position:absolute;width:min(520px,90vw);height:min(520px,90vw);border-radius:50%;
        background:conic-gradient(from 180deg at 50% 50%,#fef3c7,#fda4af,#93c5fd,#fde68a,#bbf7d0,#fef3c7);
        filter:blur(60px);opacity:.45;animation:wbcSpin 8s linear infinite;}
      [data-welcome-ceremony] .wbc-card{position:relative;max-width:420px;text-align:center;padding:2rem 1.75rem;border-radius:24px;
        background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(255,250,235,.92));
        box-shadow:0 25px 80px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.5) inset;
        animation:wbcPop .85s cubic-bezier(.2,.9,.2,1) .15s both;}
      [data-welcome-ceremony] .wbc-ribbon{font-size:.78rem;letter-spacing:.28em;text-transform:uppercase;color:#b45309;font-weight:700;margin-bottom:.75rem;animation:wbcShine 2.4s ease-in-out infinite;}
      [data-welcome-ceremony] .wbc-title{font-size:clamp(1.6rem,4vw,2.1rem);margin:0 0 .5rem;background:linear-gradient(120deg,#c2410c,#ea580c,#f59e0b,#eab308);
        -webkit-background-clip:text;background-clip:text;color:transparent;animation:wbcTitle 1.2s ease-out .2s both;}
      [data-welcome-ceremony] .wbc-sub{font-size:1.05rem;line-height:1.55;color:#334155;margin:0 0 .75rem;}
      [data-welcome-ceremony] .wbc-sub strong{color:#0f766e;font-size:1.15em;}
      [data-welcome-ceremony] .wbc-foot{font-size:.9rem;color:#64748b;margin:0;}
      @keyframes wbcFade{from{opacity:0}to{opacity:1}}
      @keyframes wbcPop{from{opacity:0;transform:scale(.88) translateY(18px)}to{opacity:1;transform:scale(1) translateY(0)}}
      @keyframes wbcTitle{from{opacity:0;letter-spacing:.2em;filter:blur(4px)}to{opacity:1;letter-spacing:normal;filter:none}}
      @keyframes wbcSpin{to{transform:rotate(360deg)}}
      @keyframes wbcConfettiFall{0%{transform:translateY(-40%) rotate(12deg)}100%{transform:translateY(120vh) rotate(12deg)}}
      @keyframes wbcShine{0%,100%{opacity:.85}50%{opacity:1;filter:brightness(1.15)}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    const end = () => {
      this.playing = false;
      root.remove();
      style.remove();
      this.clearPendingOnServer();
    };
    root.addEventListener('click', end);
    window.setTimeout(end, 7200);
  }
}
