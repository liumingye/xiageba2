export namespace StringUtil {
    /** 按分隔符切分，最多返回 limit 段（limit <= 0 视为不限制） */
    export const splitN = (current: string, delimiter: string | RegExp, limit = Infinity): string[] => {
        const max = limit <= 0 ? Infinity : Math.floor(limit)
        const sep = delimiter
        // 返回 [分隔符位置, 分隔符长度]，未命中返回 null
        const findSep: (s: string) => [number, number] | null = typeof sep === 'string'
            ? (s) => {
                if (sep === '') return null
                const index = s.indexOf(sep)
                return index < 0 ? null : [index, sep.length]
            }
            : (s) => {
                // 去掉 g 标志，否则 match 不返回 index
                const matched = s.match(new RegExp(sep.source, sep.flags.replace('g', '')))
                if (matched?.index == null || matched[0].length === 0) return null
                return [matched.index, matched[0].length]
            }

        const result: string[] = []
        while (result.length < max - 1) {
            const hit = findSep(current)
            if (hit == null) break
            result.push(current.slice(0, hit[0]))
            current = current.slice(hit[0] + hit[1])
        }

        result.push(current)
        return result
    }

    /** 从右侧按分隔符切分，最多返回 limit 段（limit <= 0 视为不限制） */
    export const splitAfterN = (current: string, delimiter: string, limit = Infinity): string[] => {
        const max = limit <= 0 ? Infinity : Math.floor(limit)
        const result: string[] = []
        if (delimiter === '') return [current]

        while (result.length < max - 1) {
            const index = current.lastIndexOf(delimiter)
            if (index < 0) break
            result.push(current.slice(index + delimiter.length))
            current = current.slice(0, index)
        }

        result.push(current)
        return result
    }
}