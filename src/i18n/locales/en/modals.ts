export const enModals = {
  titles: {
    exit: 'EXIT',
    skip: 'SKIP',
    report: 'REPORT',
    profile: 'PROFILE',
    clean: 'CLEAN',
    names: 'NAMES',
    slowDown: 'SLOW DOWN',
    kicked: 'KICKED',
    afkInactive: 'INACTIVE',
    lobbyInactive: 'INACTIVE',
    disconnected: 'DISCONNECTED',
    timeout: 'TIMEOUT',
    nicknameTaken: 'ERROR',
    roomFull: 'ERROR',
    serverFull: 'SERVER FULL',
    info: 'ROOM DETAILS',
    customEmoji: 'CUSTOM EMOJI',
  },
  exit: {
    question: 'Do you want to leave the game?',
  },
  skip: {
    question: 'Do you want to skip your turn?',
  },
  report: {
    question: 'Are you sure you want to report this drawing?',
  },
  afk: {
    question: 'Are you still there?',
    actionHint: 'Click OK to keep playing',
    disconnectCountdown_one: 'Disconnecting in: <val>{{count}}</val> second',
    disconnectCountdown_other: 'Disconnecting in: <val>{{count}}</val> seconds',
  },
  profile: {
    selfAccount: 'This is your profile',
    block: 'BLOCK',
    unblock: 'UNBLOCK',
    votekick: 'VOTEKICK',
    removeVote: 'REMOVE VOTE',
  },
  alerts: {
    cooldown: {
      message: 'You voted recently. Please wait before voting to kick again.',
    },
    kicked: {
      message: 'You were kicked from this room by player vote.',
    },
    nicknameTaken: {
      message: 'This name is already in use in this room. Choose another name to join.',
    },
    roomFull: {
      message: 'This room is full.',
    },
    serverFull: {
      message: 'The server has reached maximum capacity right now. Please try again shortly.',
    },
    joinTimeout: {
      message: 'Connection timed out while joining the room. Please try again.',
    },
  },
  customEmoji: {
    subtitle: 'Add your own emoji from your keyboard 🎨',
    pickPrompt: 'Pick an emoji',
    placeholder: 'Tap here and use the emoji keyboard...',
    invalidError: 'Please enter an emoji from your keyboard 🎨',
    submitButton: 'Add to Emojis',
  },
  colorWheel: {
    compareTooltip: 'Compare color: tap the first half to restore the previous color',
    revertTooltip: 'Restore previous color',
    currentTooltip: 'Currently selected color',
    opacity: 'Opacity',
    saveTooltip: 'Save current color to palette',
    save: 'Save',
    deleteTooltip: 'Delete selected color',
    deleteSelectedTooltip: 'Delete selected color ({{color}})',
    savedColors: 'Saved colors',
    savedCount_one: '{{count}}/{{max}} color',
    savedCount_other: '{{count}}/{{max}} colors',
    emptyHint: 'Tap "Save" to add your favorite colors here',
  },
  connection: {
    disconnectedTitle: 'Disconnected from Server',
    reconnectedTitle: 'Connection Restored',
    prolongedDisconnect: 'Unable to restore connection yet. Please check your internet connection.',
    reconnecting: 'Attempting to reconnect automatically...',
    rejoining: 'Rejoining the room...',
    returnToLobby: 'Return to Lobby',
  },
  clean: {
    question: 'Do you want to clean the drawing?',
  },
  names: {
    hideQuestion: 'Do you want to hide player names while drawing?',
    showQuestion: 'Do you want to show player names while drawing?',
  },
  lobbyAfk: {
    message: 'Disconnected due to inactivity.',
  },
  lobbyDisconnected: {
    message: 'Disconnected from the game or session expired.',
  },
} as const;
