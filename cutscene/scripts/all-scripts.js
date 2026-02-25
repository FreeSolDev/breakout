// All cutscene scripts as JS objects (avoids fetch/JSON loading in vanilla JS)

export const SCRIPTS = {
  game_start: [
    { type: 'fade', to: 1, duration: 0.01 },
    { type: 'fade', to: 0, duration: 1.5 },
    { type: 'dialogue', name: '???', text: 'Where... am I? My head is pounding.', color: '#8cf' },
    { type: 'camera', shake: { intensity: 4, duration: 0.3 } },
    { type: 'wait', duration: 0.3 },
    { type: 'dialogue', name: 'INTERCOM', text: 'ALERT: Security breach in Sublevel 7. All units respond. Lethal force authorized.', color: '#f44' },
    { type: 'dialogue', name: '???', text: "That's... me they're talking about. I need to get out of here.", color: '#8cf' },
    { type: 'wait', duration: 0.2 },
  ],

  first_enemy: [
    { type: 'dialogue', name: 'GUARD', text: 'Hey! Subject 7-B is loose! Stop right there!', color: '#e94560' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "I don't want trouble. Just let me through.", color: '#8cf' },
    { type: 'dialogue', name: 'GUARD', text: "Orders are orders. Nothing personal.", color: '#e94560' },
    { type: 'wait', duration: 0.3 },
  ],

  boss_intro: [
    { type: 'camera', shake: { intensity: 3, duration: 0.2 } },
    { type: 'dialogue', name: 'COMMANDER', text: "So you're the one causing all this chaos. I'm impressed you made it this far.", color: '#ff4444' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "Stand aside. I'm leaving this place.", color: '#8cf' },
    { type: 'dialogue', name: 'COMMANDER', text: "I have my orders. And I don't lose.", color: '#ff4444' },
    { type: 'wait', duration: 0.3 },
  ],

  floor_transition: [
    { type: 'fade', to: 1, duration: 0.5 },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "Going deeper. How far down does this facility go?", color: '#8cf' },
    { type: 'dialogue', name: 'RADIO', text: "...all subjects accounted for except 7-B... increase perimeter security...", color: '#aa8' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "They're getting nervous. Good.", color: '#8cf' },
    { type: 'fade', to: 0, duration: 0.5 },
  ],

  final_boss: [
    { type: 'camera', shake: { intensity: 5, duration: 0.4 } },
    { type: 'dialogue', name: 'THE WARDEN', text: "Subject 7-B. You've caused quite the mess.", color: '#ff4444' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "Who are you?", color: '#8cf' },
    { type: 'dialogue', name: 'THE WARDEN', text: "I built this facility. Every corridor. Every lock. Every experiment. Including you.", color: '#ff4444' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "Then you know what I'm capable of.", color: '#8cf' },
    { type: 'dialogue', name: 'THE WARDEN', text: "Precisely. Which is why you'll never leave.", color: '#ff4444' },
    { type: 'wait', duration: 0.4 },
  ],

  commander_rage: [
    { type: 'letterbox', to: 36, duration: 0.2 },
    { type: 'anim', anim: 'boss_tremble', duration: 0.8 },
    { type: 'anim', anim: 'boss_transform', duration: 1.8 },
    { type: 'dialogue', name: 'COMMANDER', text: "RRRAAAGH!! I'll DESTROY you!", color: '#ff4444' },
    { type: 'letterbox', to: 0, duration: 0.2 },
  ],

  warden_rage: [
    { type: 'letterbox', to: 36, duration: 0.2 },
    { type: 'anim', anim: 'boss_tremble', duration: 0.8 },
    { type: 'anim', anim: 'boss_transform', duration: 2.0 },
    { type: 'dialogue', name: 'THE WARDEN', text: "Project CRIMSON. You forced my hand.", color: '#ff4444' },
    { type: 'letterbox', to: 0, duration: 0.2 },
  ],

  escape: [
    { type: 'fade', to: 1, duration: 1.0 },
    { type: 'wait', duration: 0.5 },
    { type: 'dialogue', name: '', text: 'The facility shudders. Alarms wail. Emergency lights flash red.', color: '#f80' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "There — the surface elevator. Almost there.", color: '#8cf' },
    { type: 'wait', duration: 0.5 },
    { type: 'dialogue', name: '', text: 'Daylight. For the first time in as long as you can remember.', color: '#ffa' },
    { type: 'dialogue', name: 'SUBJECT 7-B', text: "I'm out. I'm actually out.", color: '#8cf' },
    { type: 'dialogue', name: '', text: "Subject 7-B escaped the facility. But the questions remain — who built this place, and why?", color: '#aaa' },
    { type: 'dialogue', name: '', text: 'BREAKOUT — END', color: '#4cf' },
    { type: 'wait', duration: 1.0 },
    { type: 'fade', to: 1, duration: 1.0 },
  ],
};
