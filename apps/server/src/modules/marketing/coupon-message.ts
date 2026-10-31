import { formatVND } from '@restaurant/shared';

export function couponGiftMessage(input: {
  lang: string;
  nameZh: string;
  nameVi: string;
  type: string;
  value: number;
  minSpend: number;
  channel: string;
  expiresAt: string;
}): string {
  const vi = input.lang === 'vi';
  const name = vi ? input.nameVi || input.nameZh : input.nameZh || input.nameVi;
  const worth =
    input.type === 'percent'
      ? vi
        ? `giảm ${input.value}%`
        : `可享 ${input.value}% 折扣`
      : vi
        ? `trị giá ${formatVND(input.value)}`
        : `价值 ${formatVND(input.value)}`;
  const use =
    input.channel === 'dine_in'
      ? vi
        ? 'Có thể dùng khi dùng bữa tại quán'
        : '可到店消费使用'
      : input.channel === 'delivery'
        ? vi
          ? 'Có thể dùng cho đơn giao hàng'
          : '可用于外卖下单'
        : vi
          ? 'Có thể dùng tại quán hoặc khi đặt giao hàng'
          : '可到店消费或外卖使用';
  const min =
    input.minSpend > 0
      ? vi
        ? ` Đơn từ ${formatVND(input.minSpend)}.`
        : `满 ${formatVND(input.minSpend)} 可用。`
      : '';
  const until = input.expiresAt.slice(0, 10);
  return vi
    ? `Quán tặng bạn phiếu giảm giá「${name}」, ${worth}. ${use}.${min} Hạn đến ${until}.`
    : `商家送给你一张优惠券「${name}」，${worth}。${use}。${min}有效期至 ${until}。`;
}
