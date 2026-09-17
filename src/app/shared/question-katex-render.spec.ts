import {
  enrichPlainTextWithKatex,
  normalizeQuestionCalculationLayout,
  normalizeQuestionLatexSource,
} from './question-katex-render';

describe('question LaTeX repair', () => {
  it('wraps bare fractions and closes an unterminated aligned display', () => {
    const source =
      'ঘনমাত্রা, S=\\frac{W}{M V}$$\\begin{aligned}\\therefore W &=S \\times M \\times V \\\\ &=2.65 \\mathrm{\\~g}\\end{aligned}যেখানে';
    const normalized = normalizeQuestionLatexSource(source);

    expect(normalized).toContain('$S=\\frac{W}{M V}$');
    expect(normalized).not.toContain('$$$');
    expect(normalized).toContain('$$\\begin{aligned}');
    expect(normalized).toContain('\\mathrm{g}\\end{aligned}$$যেখানে');
    expect(enrichPlainTextWithKatex(source)).toContain('class="katex');
  });

  it('repairs legacy asterisk subscripts and an orphan display delimiter', () => {
    const source =
      'অ্যাভোগাড্রোর সংখ্যা, \\mathrm{N}*{\\mathrm{A}}=6.02 \\times 10^{23} \\text{molecule} \\mathrm{mol}^{-1}$$=1.38 \\times 10^{-23} \\mathrm{Jk}^{-1}সুতরাং';
    const normalized = normalizeQuestionLatexSource(source);

    expect(normalized).toContain('$\\mathrm{N}_{\\mathrm{A}}=6.02');
    expect(normalized).not.toContain('$$$');
    expect(normalized).toContain('$$=1.38 \\times 10^{-23} \\mathrm{Jk}^{-1}$$সুতরাং');
  });

  it('repairs mixed single/double-dollar option formula blocks', () => {
    const source =
      'সংকেত-$\\text{i. } \\mathrm{PbCrO}*{4}$$\\text{ ii. } \\mathrm{Na}*{2} \\mathrm{CO}*{3}$$\\text{iii. } \\mathrm{K}*{2} \\mathrm{CO}_{3}$নিচের';
    const normalized = normalizeQuestionLatexSource(source);

    expect(normalized).toContain('$$\\text{i.} \\mathrm{PbCrO}_{4}\\\\\\text{ii.}');
    expect(normalized).toContain('\\mathrm{Na}_{2} \\mathrm{CO}_{3}');
    expect(normalized).toContain('\\mathrm{K}_{2} \\mathrm{CO}_{3}$$নিচের');
  });

  it('does not absorb following English prose into bare math', () => {
    const normalized = normalizeQuestionLatexSource('Use x=\\frac{W}{M} where x is the result.');
    expect(normalized).toBe('Use $x=\\frac{W}{M}$ where x is the result.');
  });

  it('repairs a single-open double-close list with an internal stray dollar', () => {
    const source =
      'রুদ্ধতাপীয় পরিবর্তনের ক্ষেত্রে- $i. PV^{\\gamma}=k ii. Tv^{\\gamma-1}=k iii. T^{$\\gamma}P^{1+\\gamma}=k$$নিচের কোনটি সঠিক?';
    const normalized = normalizeQuestionLatexSource(source);

    expect(normalized).toContain('$$\\text{i.} PV^{\\gamma}=k');
    expect(normalized).toContain('\\quad \\text{ii.} Tv^{\\gamma-1}=k');
    expect(normalized).toContain('T^{\\gamma}P^{1+\\gamma}=k$$নিচের');
    expect(normalized).not.toContain('T^{$');
    expect(normalized).not.toContain('$$$');
    expect(enrichPlainTextWithKatex(source)).toContain('class="katex');
  });

  it('renders a valid display result on its own line without visible dollar delimiters', () => {
    const source = 'মান বসিয়ে পাই:W = 300 J / 2.5$$W = 120 J$$সুতরাং, প্রয়োজনীয় কাজ 120 J।';
    const html = enrichPlainTextWithKatex(source);

    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain('$$');
    expect(html).toContain('মান বসিয়ে পাই:W = 300 J / 2.5');
    expect(html).toContain('সুতরাং, প্রয়োজনীয় কাজ 120 J।');
  });

  it('uses a delimiter-free block fallback when display math cannot be converted', () => {
    const html = enrichPlainTextWithKatex('আগে$$\\notacommand{W = 120 J}$$পরে');

    expect(html).toContain('question-math-fallback-display');
    expect(html).toContain('\\notacommand{W = 120 J}');
    expect(html).not.toContain('$$');
  });

  it('spaces Bengali sentences and collapses repeated calculation labels into continuation lines', () => {
    const source =
      'ব্যাখ্যা শেষ।প্রকৃত তাপমাত্রা = 0°C+(51°C−4°C)×100/94' +
      'প্রকৃত তাপমাত্রা = 47×100/94°C' +
      'প্রকৃত তাপমাত্রা = 50°Cসুতরাং, প্রকৃত পাঠ 50°C।';

    const normalized = normalizeQuestionCalculationLayout(source);

    expect(normalized).toBe(
      'ব্যাখ্যা শেষ।\nপ্রকৃত তাপমাত্রা = 0°C+(51°C−4°C)×100/94\n' +
      '= 47×100/94°C\n= 50°C\nসুতরাং, প্রকৃত পাঠ 50°C।'
    );
    expect(normalized.match(/প্রকৃত তাপমাত্রা =/g)?.length).toBe(1);
  });

  it('adds a missing space after Bengali danda without changing protected formula content', () => {
    expect(normalizeQuestionCalculationLayout('প্রথম।দ্বিতীয় $$\\text{এক।দুই}$$')).toBe(
      'প্রথম। দ্বিতীয় $$\\text{এক।দুই}$$'
    );
  });

  it('repairs escaped multiplication and renders an adjacent display formula without dollars', () => {
    const html = enrichPlainTextWithKatex(
      String.raw`x=10$$y=x \* 5$$y=y \\% 3উদ্দীপকে উল্লিখিত y চলকের সর্বশেষ মান কত?`
    );

    expect(html).toContain('class="katex-display"');
    expect(html.match(/class="katex-display"/g)?.length).toBe(2);
    expect(html).not.toContain('$$');
    expect(html).not.toContain('\\*');
    const normalized = normalizeQuestionLatexSource(
      String.raw`x=10$$y=x \* 5$$y=y \\% 3উদ্দীপকে উল্লিখিত y চলকের সর্বশেষ মান কত?`
    );
    expect(normalizeQuestionLatexSource(normalized)).toBe(normalized);
  });
  it('does not merge a valid inline formula, prose, and a display formula', () => {
    const source = 'নিচের কোনটি সঠিক? $F=q\\vec{v}$ এবং $$E=mc^2$$।';
    const normalized = normalizeQuestionLatexSource(source);
    expect(normalized).toContain('$F=q\\vec{v}$');
    expect(normalized).toContain('$$E=mc^2$$');
    expect(normalized).not.toContain('$$F=q\\vec{v}');
    expect(normalized).toContain(' এবং ');
  });

  it('keeps a multi-line display formula on separate lines instead of comma-joining', () => {
    const source = 'গতি: $$v = u + at\\\\ s = ut + \\frac{1}{2}at^{2}$$';
    const normalized = normalizeQuestionLatexSource(source);
    expect(normalized).toContain('$$v = u + at\\\\ s = ut');
    expect(normalized).not.toContain('$$v = u + at, s = ut');
    const html = enrichPlainTextWithKatex(source);
    expect(html).not.toContain('$$');
    expect(html).toContain('katex-display');
  });
});
