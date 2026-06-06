/**
 * 种子化伪随机数生成器 (mulberry32)
 * 种子相同 → 每次调用返回完全相同的伪随机序列，保证地形生成确定性
 */

function hashStringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0 // 转为无符号 32 位整数
}

/**
 * 创建一个种子化 PRNG 实例
 * @param seed 数字种子或字符串种子
 * @returns 每次调用返回 [0, 1) 的伪随机浮点数
 */
export function createPRNG(seed: number | string): () => number {
  let state = typeof seed === 'string' ? hashStringToSeed(seed) : (seed >>> 0)

  // mulberry32 算法
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 生成指定范围内的伪随机浮点数
 */
export function randomFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

/**
 * 生成指定范围内的伪随机整数 [min, max]
 */
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1))
}

/**
 * Box-Muller 变换：生成标准正态分布随机数
 */
export function randomGaussian(rng: () => number): number {
  const u1 = rng()
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
}
