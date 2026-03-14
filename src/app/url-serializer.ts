import { DefaultUrlSerializer, UrlTree } from '@angular/router';

/**
 * Encodes parentheses in the path so Angular does not treat them as auxiliary
 * route syntax. Without this, URLs like /institutes/Name (Abbrev) break and
 * redirect to /.
 */
export class ParenthesisSafeUrlSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    const [pathAndHash = '', ...queryParts] = url.split('?');
    const query = queryParts.length ? '?' + queryParts.join('?') : '';
    const [path = '', ...hashParts] = pathAndHash.split('#');
    const hash = hashParts.length ? '#' + hashParts.join('#') : '';
    const encodedPath = path.replace(/[()]/g, (c) =>
      '%' + c.charCodeAt(0).toString(16).toUpperCase()
    );
    return super.parse(encodedPath + hash + query);
  }
}
