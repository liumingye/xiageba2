export type Await<T> = Promise<T> | T
export type FunctionArgType<T> = T extends (args: infer A) => any ? A : never
export type FunctionArgsType<T> = T extends (...args: infer A) => any ? A : never
export type ConstructorArgType<T> = T extends new (arg: infer P) => any ? P : never;
export type ConstructorArgsType<T> = T extends new (...args: infer P) => any ? P : never;


export type AsyncFunction<T> = T extends ((...args: infer Args) => Await<infer Return>) ? (...args: Args) => Promise<Return> : never
export type AsyncObjectMethod<T extends object> = {
    [K in keyof T]: T[K] extends (...args: any) => any ? AsyncFunction<T[K]> : T[K]
};

/** 数字表示的 boolean */
export type NBoolean = 0 | 1

/** 数字表示的标识 */
export type NFlag = number

/** 同时支持数字和字符串 */
export type StringNumber = string | number
