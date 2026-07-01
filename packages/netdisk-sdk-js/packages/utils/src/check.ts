import { ArrayUtil } from "./array"
import { ObjectUtil } from "./object"

export namespace Check {
    export const isArray = ArrayUtil.isArray
    export const isObject = ObjectUtil.isObject
    export const isNullObject = ObjectUtil.isNullObject
    export const isFunction =  (v: any): v is Function => typeof v === 'function'
    export const isString = (v: any): v is string => typeof v === 'string'
    export const isNumber = (v: any): v is boolean => typeof v === 'number'

    export const isUint8Array = (v: any): v is Uint8Array => v && v instanceof Uint8Array

    export const hasNullProp = ObjectUtil.hasNullProp

}
