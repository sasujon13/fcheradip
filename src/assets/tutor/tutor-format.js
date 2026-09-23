/* Small text formatter. HTML is escaped before any formatting is applied. */
(function (root) {
  function escape(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function inline(text) {
    return escape(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function format(text) {
    let list = '', output = [];
    function closeList() { if (list) { output.push('</' + list + '>'); list = ''; } }
    for (const line of String(text).split('\n')) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
      const number = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (bullet || number) {
        const kind = bullet ? 'ul' : 'ol';
        if (list !== kind) { closeList(); list = kind; output.push('<' + kind + '>'); }
        output.push('<li>' + inline((bullet || number)[1]) + '</li>');
      } else {
        closeList();
        if (heading) { const level = Math.min(heading[1].length + 1, 6); output.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>'); }
        else if (line.trim()) output.push('<p>' + inline(line) + '</p>');
      }
    }
    closeList(); return output.join('');
  }
  root.tutorFormatText = format;
  if (typeof module !== 'undefined') module.exports = format;
})(typeof window !== 'undefined' ? window : globalThis);
