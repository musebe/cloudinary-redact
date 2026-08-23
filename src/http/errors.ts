export class HttpError extends Error {
  constructor(
    readonly status: 400 | 413 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
