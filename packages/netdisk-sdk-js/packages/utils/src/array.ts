export namespace ArrayUtil {
    export const isArray = (v: any): v is any[] => Array.isArray(v)
    export const arrayLengthCount = (...arrs: any[]) => {
        let length = 0
        for (const arr of arrs) {
            if (isArray(arr)) length += arr.length
        }
        return length
    }

    export const toArray = <T>(arr: T | T[]): T[] => {
        return isArray(arr) ? arr : [arr]
    }
}