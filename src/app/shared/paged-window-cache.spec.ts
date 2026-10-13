import { Subject } from 'rxjs';
import { PagedFetchResult, PagedWindowCache, syncPagedWindowCache } from './paged-window-cache';

describe('paged institute cache', () => {
  it('does not display an old filter response after the cache is cleared', () => {
    const cache = new PagedWindowCache<string>(10);
    const first = new Subject<PagedFetchResult<string>>();
    const second = new Subject<PagedFetchResult<string>>();
    const displayed: string[][] = [];

    const oldRequest = syncPagedWindowCache({
      cache, currentPage: 1, fetchPage: () => first,
      onDisplay: items => displayed.push(items),
    });
    cache.clear();
    const newRequest = syncPagedWindowCache({
      cache, currentPage: 1, fetchPage: () => second,
      onDisplay: items => displayed.push(items),
    });
    second.next({ items: ['new filter'], totalCount: 1 });
    first.next({ items: ['old filter'], totalCount: 1 });

    expect(displayed).toEqual([['new filter']]);
    expect(cache.get(1)).toEqual(['new filter']);
    oldRequest.unsubscribe();
    newRequest.unsubscribe();
  });
});
