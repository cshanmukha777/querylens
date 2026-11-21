export class QueryLensError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class SqlParseError extends QueryLensError {}
export class UnsupportedStatementError extends QueryLensError {}
export class AdapterError extends QueryLensError {}
