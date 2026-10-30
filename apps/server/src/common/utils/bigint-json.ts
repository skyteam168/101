/** 让 JSON.stringify 能序列化 BigInt（金额转 number） */
export function patchBigIntJson(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function toJSON(this: bigint): number {
    return Number(this);
  };
}
