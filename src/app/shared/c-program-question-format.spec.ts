import { formatMaybeCProgramQuestionText } from './c-program-question-format';

describe('C program question formatting', () => {
  it('extracts a brace-wrapped dense snippet between Bengali prose', () => {
    const source =
      'নিচের উদ্দীপকটি পড় এবং ২১৯ ও ২২০নং প্রশ্নের উত্তর দাও:' +
      '{int a = 2; b; b = ++a; Printf("%d",b);}' +
      "উদ্দীপকে 'b' এর মান কত?";

    const formatted = formatMaybeCProgramQuestionText(source);

    expect(formatted).toContain('<span class="q-code-block"><code>');
    expect(formatted).toContain('int a = 2;<br />');
    expect(formatted).toContain('b = ++a;<br />');
    expect(formatted).toContain('Printf(&quot;%d&quot;,b);');
    expect(formatted).toContain("উদ্দীপকে 'b' এর মান কত?");
  });
});
