import { ChatComponent } from './chat.component';

describe('Cheradip support bot', () => {
  function createComponent(): ChatComponent {
    const renderer = { setStyle: () => undefined } as any;
    const loading = { setTotal: () => undefined, completeOne: () => undefined } as any;
    const component = new ChatComponent(renderer, loading);
    component.ngOnInit();
    return component;
  }

  it('matches more than one thousand natural phrasings to reviewed answers', () => {
    const component = createComponent();
    expect(component.totalAnswers).toBeGreaterThan(140);
    expect(component.totalSearchQuestions).toBeGreaterThan(1000);

    component.question = 'What is tutor.cheradip.com for?';
    component.ask();

    expect(component.messages.at(-1)?.text).toContain('curriculum-aware AI Tutor');
    expect(component.awaitingSatisfaction).toBeTrue();
    expect(component.suggestions.length).toBeGreaterThan(0);
  });

  it('opens guided chapter, topic, subtopic and tag refinement', () => {
    const component = createComponent();
    component.question = 'How do I add money?';
    component.ask();
    component.rateAnswer(false);

    expect(component.stage).toBe('refine');
    component.selectChapter('welcome-navigation');
    component.selectTopic('Student learning');
    component.selectSubtopic('What is tutor.cheradip.com for');

    expect(component.tagOptions.length).toBeGreaterThan(0);
    expect(component.refinedResults.length).toBe(1);
  });

  it('offers human handoff only after a refined answer is rejected', () => {
    const component = createComponent();
    component.selectChapter('welcome-navigation');
    component.selectTopic('Student learning');
    component.selectSubtopic('What is tutor.cheradip.com for');
    component.chooseRefinedAnswer(component.refinedResults[0]);
    component.rateAnswer(false);

    expect(component.stage).toBe('escalate');
    expect(component.humanChannelRequested).toBeFalse();
    component.requestHumanSupport();
    expect(component.humanChannelRequested).toBeTrue();
  });
});
