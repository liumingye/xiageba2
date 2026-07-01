import { Check } from "./check"
import { AsyncObjectMethod } from "./types"
import { Lock as AsyncLock } from "async-await-mutex-lock";

export { AsyncLock }
export namespace ObjectUtil {
    export const isObject = (v: any): v is object => typeof v === 'object' && v != null

    export const isNullObject = (v: any) => {
        if (v != null && isObject(v)) {
            const props = Object.getOwnPropertyNames(v)
            // @ts-ignore
            return props.every(prop => v[prop] == null)
        }
        return true
    }

    export const hasNullProp = (v: any) => {
        if (v != null && isObject(v)) {
            const props = Object.getOwnPropertyNames(v)
            // @ts-ignore
            return props.some(prop => v[prop] == null)
        }
        return true
    }

    export const bindObject = <T, K extends keyof T>(obj: T, method: K): T[K] => {
        // @ts-ignore
        if (Check.isFunction(obj[method])) return obj[method].bind(obj)
        return obj[method]
    }

    /**
     * 给对象中的方法增加互斥锁
     * @param obj 
     * @param single [default=true] 每个方法使用同一个锁
     * @returns 
     */
    export const LockSymbol = Symbol('lock')
    export type ILockObject<T extends object> = AsyncObjectMethod<T> & {
        [LockSymbol]: AsyncLock<undefined | keyof T>
    }
    export const createObjectLock = <T extends Object>(obj: T, single = true) => {
        const lock = new AsyncLock()
        // @ts-ignore
        return new Proxy(obj, {
            get(target, prop) {
                if (prop == LockSymbol) return lock
                // @ts-ignore
                const value: unknown = target[prop]
                if (Check.isFunction(value)) {
                    return async function () {
                        await lock.acquire(single ? void 0 : prop)
                        try {
                            // @ts-ignore
                            return value.apply(this, arguments)
                        } finally { lock.release(single ? void 0 : prop) }
                    }
                }
                return value
            }
        }) as ILockObject<T>
    }
}