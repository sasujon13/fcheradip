import {of,Subject} from 'rxjs';
import {PricingRulesComponent} from './pricing-rules.component';
describe('Central pricing controls',()=>{
  let component:PricingRulesComponent;let http:any;
  const rules={start_percent:'20',minimum_percent:'10',step_percent:'1',band_size:'100',discount_percent:'10'};
  beforeEach(()=>{http={get:jasmine.createSpy().and.returnValue(of({pricing_rules:rules})),patch:jasmine.createSpy().and.returnValue(of({pricing_rules:rules})),post:jasmine.createSpy()};
    component=new PricingRulesComponent({url:'/admin',http} as any);component.canEdit=true;component.canApply=true;});
  it('saving never automatically reprices existing products',async()=>{
    await component.ngOnInit();component.invalidate();await component.save();
    expect(http.patch).toHaveBeenCalled();expect(http.post).not.toHaveBeenCalled();expect(component.dirty).toBeFalse();
  });
  it('previews before applying and carries its settings signature',async()=>{
    http.post.and.returnValue(of({processed:1,cursor:4,upper_bound:4,total:1,has_more:false,counts:{changed:1},samples:[],policy_signature:'snapshot'}));
    await component.run(true);expect(http.post).not.toHaveBeenCalled();
    await component.run(false);expect(component.previewComplete).toBeTrue();
    await component.run(true);expect(http.post.calls.mostRecent().args[1].policy_signature).toBe('snapshot');
    expect(component.previewComplete).toBeFalse();expect(component.counts.changed).toBe(1);
  });
  it('does not overlap runs and cancellation stops subsequent batches',async()=>{
    const result=new Subject<any>();http.post.and.returnValue(result);
    const run=component.run(false);await component.run(false);expect(http.post).toHaveBeenCalledTimes(1);
    component.cancelRequested=true;result.next({processed:25,cursor:25,upper_bound:100,total:100,has_more:true,counts:{},samples:[],policy_signature:'snapshot'});
    await run;expect(http.post).toHaveBeenCalledTimes(1);expect(component.previewComplete).toBeFalse();expect(component.running).toBeFalse();
  });
  it('requires saved rules and explicit permission for price updates',async()=>{
    component.dirty=true;await component.run(false);expect(http.post).not.toHaveBeenCalled();
    component.dirty=false;component.canApply=false;await component.run(false);expect(http.post).not.toHaveBeenCalled();
  });
});
