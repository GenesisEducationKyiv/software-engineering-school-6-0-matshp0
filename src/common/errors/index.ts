export class AlreadyExistsError extends Error {
  constructor(message: string = 'The resource already exists') {
    super(message);
    this.name = 'AlreadyExistsError';
    Object.setPrototypeOf(this, AlreadyExistsError.prototype);
  }
}

export class ResourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceConflictError';
    Object.setPrototypeOf(this, ResourceConflictError.prototype);
  }
}

export class UniqueConstraintViolation extends Error {
  constructor(field: string) {
    super(`A record with this ${field} already exists`);
    this.name = 'UniqueConstraintViolation';
    Object.setPrototypeOf(this, UniqueConstraintViolation.prototype);
  }
}
