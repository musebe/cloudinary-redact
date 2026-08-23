export class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 413 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}
