import { createHmac,createHash } from 'crypto';
import { IFile } from "./types";

export const decryptMd5 = (md5: string) => {
    const c9 = md5[9].charCodeAt(0) - 'g'.charCodeAt(0)
    if (c9 < 0) return md5;

    var key2 = md5.slice(0, 9) + c9.toString(16) + md5.slice(10);
    var key3 = "";
    for (let i = 0; i < key2.length; i++)
        key3 += (parseInt(key2[i], 16) ^ (15 & i)).toString(16);
    return key3.slice(8, 16) + key3.slice(0, 8) + key3.slice(24, 32) + key3.slice(16, 24);
}

export const encryptMd5 = (md5: string) => {
    const key = md5.slice(8, 16) + md5.slice(0, 8) + md5.slice(24, 32) + md5.slice(16, 24);
    let key2 = "";
    for (let i = 0; i < key.length; i++)
        key2 += (parseInt(key[i], 16) ^ (15 & i)).toString(16);

    const key3 = String.fromCharCode(parseInt(key2[9], 16) + 'g'.charCodeAt(0))
    return key2.slice(0, 9) + key3 + key2.slice(10);
}

export const decodeSceKey = (scekey: string) => {
    return scekey.replaceAll('-', '+').replaceAll('~', '=').replaceAll('_', '/')
}

export const getFileTime = (file: IFile) => {
    const mtime = file.mtime ?? file.local_mtime ?? file.server_mtime
    const ctime = file.ctime ?? file.local_ctime ?? file.server_ctime
    return { mtime, ctime }
}

export const replaceUrl = (u: string, cond: boolean = true) => cond ? u.replace("d.pcs.baidu.com", "bjbgp01.baidupcs.com") : u

// android pc 通用
export const generateSharedownloadSign = (post_params_str: string, device_id: string, timestamp: number): string => {
    const base_string = `${post_params_str}_${device_id}_${timestamp}`;
    const dynamic_key = "B8ec24caf34ef7227c66767d29ffd3fb";
    const hmac = createHmac('sha1', dynamic_key);
    hmac.update(base_string);
    return hmac.digest('hex');
}

class ARC4 {
    private s: number[];
    private i: number = 0;
    private j: number = 0;

    constructor(key: Buffer) {
        this.s = Array.from({ length: 256 }, (_, i) => i);
        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + this.s[i] + key[i % key.length]) % 256;
            [this.s[i], this.s[j]] = [this.s[j], this.s[i]];
        }
    }

    private crypt(data: Buffer): Buffer {
        const out = Buffer.alloc(data.length);
        for (let k = 0; k < data.length; k++) {
            this.i = (this.i + 1) % 256;
            this.j = (this.j + this.s[this.i]) % 256;
            [this.s[this.i], this.s[this.j]] = [this.s[this.j], this.s[this.i]];
            const t = (this.s[this.i] + this.s[this.j]) % 256;
            out[k] = data[k] ^ this.s[t];
        }
        return out;
    }

    encrypt(data: Buffer): Buffer {
        return this.crypt(data);
    }

    decrypt(data: Buffer): Buffer {
        return this.crypt(data);
    }
}

export const getTrueSk = (encrypted_sk: string, uid: string): string | null => {
    try {
        const decoded_sk_bytes = Buffer.from(encrypted_sk, 'base64');
        const key_bytes = Buffer.from(uid, 'utf-8');
        const cipher = new ARC4(key_bytes);
        return cipher.decrypt(decoded_sk_bytes).toString('utf-8');
    } catch (e) {
        console.error("SK decryption failed:", e);
        return null;
    }
}

export namespace Android {
    export const DEVICE_ID = "BB91C9B818963851F99A99261A70E37E|VUFQKX5JL";
    export const APP_SIGNATURE_CERT_MD5 = "ae5821440fab5e1a61a025f014bd8972";
    export const APP_VERSION = "11.10.4";
    export const CLIENT_TYPE = "1";
    export const CHANNEL = "android";

    export const calculateRand = (timestamp_ms: number, bduss: string, uid: string, sk: string): string => {
        if (!bduss || !uid || !sk) {
            return "cannot_calculate";
        }
        const true_sk = getTrueSk(sk, uid);
        if (!true_sk) {
            return "cannot_calculate";
        }

        const sha1_of_bduss = createHash('sha1').update(bduss).digest('hex');
        const base_string =
            sha1_of_bduss + uid + true_sk + timestamp_ms.toString() +
            DEVICE_ID + APP_VERSION + APP_SIGNATURE_CERT_MD5;

        return createHash('sha1').update(base_string).digest('hex');
    }

}



