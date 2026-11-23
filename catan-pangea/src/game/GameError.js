/** A failure the player should hear about (shown as a toast), with a code the app can act on. */
export class GameError extends Error {
  constructor(code, message){ super(message); this.name = "GameError"; this.code = code; }
}
