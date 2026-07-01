export type CustomError = {
    type?: string;
    errno?: string;
    syscall?: string;
    cause?(): Error;
    fullType?(this: CustomError): string;
    info?(): Record<string, unknown>;
    toJSON?(): Record<string, unknown>;
} & Error;
declare class StructuredError extends Error {
    /** @returns {string} */
    static get type(): string;
    /**
     * @param {CustomError | null} error
     * @returns {Record<string, unknown>}
     */
    static getInfo(error: CustomError | null): Record<string, unknown>;
    /**
     * @param {string} messageTmpl
     * @param {Record<string, unknown>} [info]
     * @returns {StructuredError}
     */
    static create(messageTmpl: string, info?: Record<string, unknown>): StructuredError;
    /**
     * @param {string} message
     * @param {object} info
     */
    constructor(message: string, info: object);
    /** @type {string} */
    type: string;
    /** @type {object} */
    __info: object;
    /** @returns {Record<string, unknown>} */
    info(): Record<string, unknown>;
    /** @returns {Record<string, unknown>} */
    toJSON(): Record<string, unknown>;
}
declare class WrappedError extends Error {
    /** @returns {string} */
    static get type(): string;
    /**
     * @param {Error} err
     * @returns {string}
     */
    static fullStack(err: Error): string;
    /**
     * @param {Error} err
     * @param {string} name
     * @returns {CustomError | null}
     */
    static findCauseByName(err: Error, name: string): CustomError | null;
    /**
     * @param {CustomError | null} cause
     * @param {object} [info]
     * @returns {Record<string, unknown>}
     */
    static fullInfo(cause: CustomError | null, info?: object): Record<string, unknown>;
    /**
     * @param {string} messageTmpl
     * @param {Error} cause
     * @param {object} [info]
     * @returns {WrappedError}
     */
    static wrap(messageTmpl: string, cause: Error, info?: object): WrappedError;
    /**
     * @param {string} message
     * @param {CustomError} cause
     * @param {object} info
     */
    constructor(message: string, cause: CustomError, info: object);
    /** @type {string} */
    type: string;
    /** @type {object} */
    __info: object;
    /** @type {CustomError} */
    __cause: CustomError;
    /** @returns {string} */
    fullType(): string;
    /** @returns {CustomError} */
    cause(): CustomError;
    /** @returns {Record<string, unknown>} */
    info(): Record<string, unknown>;
    /** @returns {Record<string, unknown>} */
    toJSON(): Record<string, unknown>;
}
export class MultiError extends Error {
    /**
     * @param {Error[]} errors
     * @returns {null | Error | MultiError}
     */
    static errorFromList(errors: Error[]): null | Error | MultiError;
    /**
     * @param {CustomError[]} errors
     */
    constructor(errors: CustomError[]);
    /** @type {CustomError[]} */
    __errors: CustomError[];
    /** @type {string} */
    type: string;
    /** @returns {CustomError[]} */
    errors(): CustomError[];
    /**
     * @returns {{
     *    message: string,
     *    stack: string,
     *    type: string,
     *    name: string,
     *    errors: object[]
     * }}
     */
    toJSON(): {
        message: string;
        stack: string;
        type: string;
        name: string;
        errors: object[];
    };
}
/**
 * @param {CustomError} err
 * @param {string} name
 * @returns {CustomError | null}
 */
export function findCauseByName(err: CustomError, name: string): CustomError | null;
/**
 * @param {CustomError} err
 * @returns {string}
 */
export function fullStack(err: CustomError): string;
/**
 * @param {CustomError | null} error
 * @returns {Record<string, unknown>}
 */
export function getInfo(error: CustomError | null): Record<string, unknown>;
/**
 * @param {string} messageTmpl
 * @param {Error} cause
 * @param {object} info
 * @returns {WrappedError}
 */
export function wrapf(messageTmpl: string, cause: Error, info: object): WrappedError;
/**
 * @param {string} messageTmpl
 * @param {Record<string, unknown>} [info]
 * @returns {StructuredError}
 */
export function errorf(messageTmpl: string, info?: Record<string, unknown>): StructuredError;
/**
 * @param {string} name
 * @returns {string}
 */
declare function getTypeNameCached(name: string): string;
export { StructuredError as SError, WrappedError as WError, getTypeNameCached as getTypeName };
