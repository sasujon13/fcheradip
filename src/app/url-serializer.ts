import { DefaultUrlSerializer, UrlTree } from '@angular/router';

/**
 * Encode slug for URL so Bengali/Unicode stay visible in the address bar.
 * Only encode space, %, and & so the URL remains valid.
 */
export function slugForUrlDisplay(slug: string): string {
  if (!slug) return slug;
  return String(slug)
    .replace(/%/g, '%25')
    .replace(/&/g, '%26')
    .replace(/ /g, '%20');
}

/**
 * Encodes parentheses in the path so Angular does not treat them as auxiliary
 * route syntax. Serializes paths so Bengali/Unicode stay visible (not %E0%A6%...).
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

  override serialize(tree: UrlTree): string {
    const raw = super.serialize(tree);
    const [pathAndHash = '', ...queryParts] = raw.split('?');
    const query = queryParts.length ? '?' + queryParts.join('?') : '';
    const [path = '', ...hashParts] = pathAndHash.split('#');
    const hash = hashParts.length ? '#' + hashParts.join('#') : '';
    let pathDisplay = path;
    try {
      pathDisplay = decodeURIComponent(path).replace(/ /g, '%20');
    } catch {
      pathDisplay = path;
    }
    return pathDisplay + query + hash;
  }
}
