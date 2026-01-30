const AMOUNT_INFO_USED = 0.1;

export function getRandomInfo(info: string[], amount?: number) {
    return info.sort(() => Math.random() - 0.5).slice(0, amount ?? Math.floor(info.length * AMOUNT_INFO_USED))
}
