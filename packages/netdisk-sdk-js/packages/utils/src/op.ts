import { Await } from "./types"
import { Check } from "./check.js"
import { ObjectUtil } from "./object"

type ExtractFile<Result> =
    Result extends Array<infer F> ? F :
    Result extends { list: Array<infer F> } ? F :
    Result extends { data: Array<infer F> } ? F :
    never

const defaultTransferFile = (result: any): any => {
    if (Check.isArray(result)) return result
    if (ObjectUtil.isObject(result)) {
        if ('list' in result) return result['list']
        if ('data' in result) return result['data']
    }
    return []
}
const defaultHasMore = (result: any): boolean => {
    return result != null && defaultTransferFile(result).length > 0
}

export const createListIter = <ListParam, ListResult, IFile = ExtractFile<ListResult>, FPage extends (keyof ListParam | 'page' | string) = 'page'>(
    list: (param: ListParam) => Await<ListResult>,
    option: {
        /** 分页、偏移使用的字段 */
        pageField?: FPage,
        /** 使用偏移，而不是分页 @default !pageField.includes('page')*/
        offsetFlag?: boolean
        /** 获取返回值中的file */
        transferFile?: (result: ListResult) => IFile[],
        /** 是否还存在数据 */
        hasMore?: (result: ListResult) => boolean,
    } = {}
): ((param: ListParam & { [K in FPage]?: never }) => AsyncGenerator<IFile>) => {
    const {
        pageField = "page",
        offsetFlag = !(pageField as string).includes('page'),
        transferFile = defaultTransferFile,
        hasMore = defaultHasMore
    } = option

    return async function* (param: Omit<ListParam, FPage>) {
        for (let [page, count] = [1, 0]; ; page++) {
            const result = await list({
                ...param,
                [pageField]: offsetFlag ? count : page
            } as any)

            const files = transferFile(result)
            for (const file of files) {
                yield file
                count++
            }

            if (!hasMore(result) || files.length === 0) break
        }
    }
}

export const createWalkIter = <Param, IFile, Extend = Record<string, any>>(
    fileIter: (param: Param) => AsyncIterable<IFile>,
    option: {
        /** 获取下一层参数 */
        getNextParam: (file: IFile, param: Param) => Param | null,
        transferFile?: (pfile: IFile & Extend | null, file: IFile) => IFile & Extend,
        /** 进入目录深度 @default Infinity (<=0 时不做限制) */
        deep?: number,
        /** 最多获取数量 @default Infinity (<=0 时不做限制) */
        maxcount?: number
    }
) => {
    // 默认值设为 0，然后在下面进行判断
    let { getNextParam, transferFile, deep = 0, maxcount = 0 } = option

    // 当 deep 或 maxcount 小于等于 0 时，视为没有限制
    if (deep <= 0) deep = Infinity;
    if (maxcount <= 0) maxcount = Infinity;

    let currenCount = 0
    const walk = async function* (pfile: IFile & Extend | null, param: Param, currenDeep: number): AsyncIterable<IFile & Extend> {
        for await (const file of fileIter(param)) {
            if (++currenCount > maxcount) {
                break
            }

            const newFile = transferFile?.(pfile, file) || file as any
            yield newFile

            const folderParam = getNextParam(newFile, param)
            if (folderParam != null && currenDeep < deep) {
                yield* walk(newFile, folderParam, currenDeep + 1)
            }
        }
    }
    return (param: Param) => walk(null, param, 0)
}
