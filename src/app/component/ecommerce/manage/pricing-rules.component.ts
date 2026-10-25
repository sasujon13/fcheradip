import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CommerceManagementService } from '../../../service/commerce-management.service';

@Component({selector:'app-pricing-rules',standalone:true,imports:[CommonModule,FormsModule],
  template:`<section class="pricing-panel"><header><h2>Central pricing rules</h2><p>Markup on all approved product costs, followed by whole-taka rounding and the sale reference price.</p></header>
    <p role="alert" *ngIf="error" class="error">{{error}}</p>
    <form (ngSubmit)="save()" *ngIf="rules"><div class="rule-grid"><label *ngFor="let field of fields">{{field.label}}<input type="number" [name]="field.key" [min]="field.key==='band_size' ? 0.01 : 0" [max]="field.key==='band_size' ? 999999999 : field.key==='discount_percent' ? 99.99 : 100" step="0.01" [(ngModel)]="rules[field.key]" [disabled]="running || saving || !canEdit" (ngModelChange)="invalidate()" required></label></div>
    <p class="summary">Through ৳{{rules.band_size}}: {{rules.start_percent}}% markup. Each further cost band decreases markup by {{rules.step_percent}} percentage point(s), down to {{rules.minimum_percent}}%. Sale discount: {{rules.discount_percent}}%.</p>
    <p class="summary">Example: calculated price ৳829.14 → increase 11.11% → reference rounded to ৳920 → 10% off → ৳828. Reference endings 0–3 round down and 4–9 round up to tens. The final discounted price rounds up to whole taka. Whole-cost bands can cause price drops at boundaries.</p>
    <button type="submit" [disabled]="running || saving || !canEdit || !dirty">{{saving ? 'Saving…' : 'Save rules'}}</button><span role="status">{{message}}</span></form>
    <div class="actions"><button type="button" (click)="run(false)" [disabled]="running || dirty || !canApply">Preview supplier prices</button><button type="button" (click)="confirmApply=true" [disabled]="running || dirty || !previewComplete || !canApply">Apply previewed rule</button><button type="button" class="cancel" *ngIf="running" (click)="cancelRequested=true">Cancel</button></div>
    <div *ngIf="confirmApply" class="confirmation" role="alertdialog" aria-label="Apply pricing rule"><p>Apply to unchanged generated supplier prices only? Staff-edited prices and accepted orders stay unchanged. Cancellation stops future batches; completed changes remain.</p><button (click)="confirmApply=false;run(true)">Confirm apply</button><button class="secondary" (click)="confirmApply=false">Back</button></div>
    <div *ngIf="processed || running" role="status"><progress *ngIf="total" [value]="processed" [max]="total"></progress><p>{{running ? (applying ? 'Applying' : 'Previewing') : 'Checked'}} {{processed}} / {{total || '…'}} · {{counts.changed || 0}} changes · {{counts.manual_prices_preserved || 0}} staff prices preserved · {{counts.needs_source_review || 0}} held for source review</p></div>
    <div class="samples" *ngIf="samples.length"><table><thead><tr><th>Product</th><th>Current</th><th>Sale</th><th>Reference</th></tr></thead><tbody><tr *ngFor="let item of samples"><td>{{item.name}}</td><td>৳{{item.old_price}}</td><td>৳{{item.sale_price}}</td><td><del>৳{{item.regular_price}}</del></td></tr></tbody></table></div>
  </section>`,
  styles:[`.pricing-panel{padding:clamp(14px,3vw,28px);border-radius:16px;background:white;color:#183e37;border:1px solid #dceae5}h2{margin-top:0}.rule-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}label{display:flex;flex-direction:column;gap:7px;font-weight:600}input{min-width:0;padding:10px;border:1px solid #bbd6ce;border-radius:8px}.summary{font-size:13px;color:#53736a;line-height:1.6}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}button{background:#007f80;color:white;padding:10px 16px;border:0;border-radius:8px;cursor:pointer;margin-right:7px}button:disabled{opacity:.5;cursor:not-allowed}.cancel{background:#b52836}.secondary{background:#566765}.error{color:#a61d33}.confirmation{padding:16px;background:#fff5d8;border-radius:10px}.samples{overflow:auto}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #e1ece7}td:not(:first-child){white-space:nowrap}progress{width:100%;accent-color:teal}del{color:#b52f3d}`]})
export class PricingRulesComponent implements OnInit,OnDestroy {
  @Input() canEdit=false; @Input() canApply=false;
  rules:any=null;dirty=false;saving=false;running=false;applying=false;error='';message='';confirmApply=false;
  cancelRequested=false;previewComplete=false;processed=0;total=0;counts:any={};samples:any[]=[];
  private signature='';private previewUpper=0;private alive=true;
  fields=[{key:'start_percent',label:'Starting markup (%)'},{key:'minimum_percent',label:'Minimum markup (%)'},
    {key:'step_percent',label:'Decrease per band (points)'},{key:'band_size',label:'Cost band size (Tk)'},
    {key:'discount_percent',label:'Automatic sale discount (%)'}];
  constructor(public service:CommerceManagementService){}
  async ngOnInit(){try{const data:any=await firstValueFrom(this.service.http.get(`${this.service.url}/delivery-settings/`));if(this.alive)this.rules={...data.pricing_rules};}catch(e:any){this.error=e.error?.detail || 'Could not load pricing rules.';}}
  ngOnDestroy(){this.alive=false;this.cancelRequested=true;}
  invalidate(){this.dirty=true;this.previewComplete=false;this.confirmApply=false;this.message='';}
  async save(){if(!this.canEdit || this.running || this.saving)return;this.saving=true;this.error='';try{
    const data:any=await firstValueFrom(this.service.http.patch(`${this.service.url}/delivery-settings/`,{pricing_rules:this.rules}));
    if(this.alive){this.rules={...data.pricing_rules};this.dirty=false;this.previewComplete=false;this.message='Saved. Existing prices change only after preview and apply.';}
  }catch(e:any){this.error=JSON.stringify(e.error || 'Could not save rules.');}finally{this.saving=false;}}
  async run(apply:boolean){if(this.running || this.saving || this.dirty || !this.canApply || (apply&&!this.previewComplete))return;
    let signature=apply?this.signature:'';this.running=true;this.applying=apply;this.cancelRequested=false;this.error='';this.message='';this.processed=0;this.total=0;this.counts={};this.samples=[];this.previewComplete=false;
    let cursor=0,upper=apply?this.previewUpper:0;
    try{while(this.alive&&!this.cancelRequested){
      const data:any=await firstValueFrom(this.service.http.post(`${this.service.url}/pricing/reprice/`,{apply,cursor,upper_bound:upper,policy_signature:signature}));
      if(!this.alive)break;this.processed+=data.processed;cursor=data.cursor;upper=data.upper_bound;this.total=data.total;
      this.signature=data.policy_signature;signature=data.policy_signature;for(const key of Object.keys(data.counts))this.counts[key]=(this.counts[key]||0)+data.counts[key];
      this.samples=[...this.samples,...data.samples].slice(0,15);
      if(!data.has_more){this.previewComplete=!apply;if(!apply)this.previewUpper=upper;this.message=apply?'Generated supplier prices updated. Accepted orders and staff prices preserved.':'Preview complete. Review the proposed prices before applying.';break;}
    }if(this.cancelRequested)this.message='Stopped after the last completed batch. Completed changes remain.';
    }catch(e:any){this.error=e.error?.detail || 'Pricing batch stopped. Preview again before applying.';}finally{this.running=false;}
  }
}
