export function getRandomInfo(info: string[], amount?: number) {
    return info.sort(() => Math.random() - 0.5).slice(0, amount ?? Math.floor(info.length * 0.33))
}
