export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {}

export class ConflictError extends DomainError {}

export class AlreadyExistsError extends Error {
  constructor(message: string = 'The resource already exists') {
    super(message);
    this.name = 'AlreadyExistsError';
    Object.setPrototypeOf(this, AlreadyExistsError.prototype);
  }
}
