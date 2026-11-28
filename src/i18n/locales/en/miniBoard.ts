export const enMiniBoard = {
  titles: {
    freeDraw: 'FREE DRAW',
    waiting: 'WAITING',
    newTurn: 'NEW TURN!',
    skipped: 'SKIPPED!',
    inactive: 'INACTIVE',
    canceledTurn: 'CANCELED TURN',
    interval: 'INTERVAL',
    perfect: 'PERFECT!',
    roundComplete: 'ROUND COMPLETE',
  },
  freeDraw: {
    description: 'Draw whatever you want. No timer, no prompt.',
    startButton: 'Start Drawing',
    joinButton: 'Join Drawing',
    returnButton: 'Return to Drawing',
  },
  waiting: {
    message: 'Waiting for players',
  },
  choosing: {
    turnOf: "It's the turn of",
  },
  roundEnd: {
    defaultDrawer: 'The drawer',
    skippedSelf: "You've skipped the turn",
    skippedOther: '<drawer>{{drawerName}}</drawer> skipped the turn',
    turnLostSelf: "You've lost your turn :(",
    turnLostOther: '<drawer>{{drawerName}}</drawer> has lost the turn',
    canceledScore: 'Users score has been canceled',
    intervalSubtitle: 'Take a while to relax',
    allGuessed: 'Everybody hit the answer!',
    nobodyGuessed: 'Nobody hit the answer :(',
    theAnswerWas: 'The answer was:',
  },
  podium: {
    restOfLeaderboard: 'Rest of Leaderboard',
    points_one: '{{count}} pt',
    points_other: '{{count}} pts',
    medalAlt: {
      first: '1st Place',
      second: '2nd Place',
      third: '3rd Place',
    },
  },
} as const;
