/**
 * 公开预定 API（POST /api/public/reservations）
 */
import { apiPost } from './http';

export type CreateReservationDto = {
  customerName: string;
  phone: string;
  guestCount: number;
  reserveAt: string;
  remark?: string;
};

export type PublicReservation = {
  id: string;
  customerName: string;
  phone: string;
  guestCount: number;
  reserveAt: string;
  remark?: string | null;
  status: string;
};

export function createReservation(dto: CreateReservationDto): Promise<PublicReservation> {
  return apiPost('/public/reservations', dto);
}
