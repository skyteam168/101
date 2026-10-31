import { apiGet } from './http';

export type LoginLogRow = {
  id: string;
  storeId: string | null;
  userId: string | null;
  username: string;
  result: 'success' | 'fail' | 'logout';
  failReason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type OperationLogRow = {
  id: string;
  storeId: string | null;
  userId: string | null;
  username: string | null;
  displayName: string | null;
  module: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
};

export type PageResult<T> = {
  total: number;
  page: number;
  pageSize: number;
  list: T[];
};

export type LoginLogQuery = {
  page?: number;
  pageSize?: number;
  username?: string;
  result?: string;
  ip?: string;
  from?: string;
  to?: string;
};

export type OperationLogQuery = {
  page?: number;
  pageSize?: number;
  username?: string;
  module?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
};

export type CustomerLoginLogRow = {
  id: string;
  customerId: string | null;
  email: string;
  action: string;
  result: 'success' | 'fail' | 'logout';
  failReason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type CustomerLoginLogQuery = {
  page?: number;
  pageSize?: number;
  email?: string;
  action?: string;
  result?: string;
  ip?: string;
  from?: string;
  to?: string;
};

export const listLoginLogsApi = (params: LoginLogQuery) =>
  apiGet<PageResult<LoginLogRow>>('/audit/login-logs', params);

export const listCustomerLoginLogsApi = (params: CustomerLoginLogQuery) =>
  apiGet<PageResult<CustomerLoginLogRow>>('/audit/customer-login-logs', params);

export const listOperationLogsApi = (params: OperationLogQuery) =>
  apiGet<PageResult<OperationLogRow>>('/audit/operation-logs', params);
