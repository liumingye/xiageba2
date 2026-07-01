export namespace StringUtil {
    export const splitN = (current: string, delimiter: string | RegExp, limit = Infinity) => {
        const result = [];
        while (limit--) {
            // const index = delimiter instanceof RegExp ? current.match(delimiter)?.index : current.indexOf(delimiter)
            const index = current.search(delimiter)
            if (index > 0 && limit) {
                result.push(current.substring(0, index))
                current = current.substring(index + 1)
            } else {
                result.push(current)
                break
            }
        }
        return result;
    }

    export const splitAfterN = (current: string, delimiter: string, limit = Infinity) => {
        const result = [];
        while (limit--) {
            const index = current.lastIndexOf(delimiter)
            if (index > 0 && limit) {
                result.push(current.substring(index + 1))
                current = current.substring(0, index)
            } else {
                result.push(current)
                break
            }
        }
        return result;
    }
}