/** 打印任务结构化 payload（服务端生成，代理渲染） */

export type PrintTemplate =
  | 'kitchen'
  | 'front'
  | 'add'
  | 'void'
  | 'cancel'
  | 'receipt'
  | 'delivery'
  | 'shift'
  | 'test';

export type PrintPayloadItem = {
  nameZh: string;
  nameVi: string;
  qty: number;
  unitPrice?: number;
  amount?: number;
  remark?: string | null;
};

export type PrintTicketPayload = {
  template: PrintTemplate;
  paperWidth: 58 | 80;
  data: {
    storeNameZh?: string;
    storeNameVi?: string;
    tableCode?: string | null;
    orderNo?: string;
    roundNo?: number;
    titleZh?: string;
    titleVi?: string;
    remark?: string | null;
    items?: PrintPayloadItem[];
    subtotal?: number;
    discount?: number;
    serviceCharge?: number;
    deliveryFee?: number;
    total?: number;
    paidAmount?: number;
    payments?: { method: string; amount: number }[];
    createdAt?: string;
    address?: string | null;
    phone?: string | null;
    customerName?: string | null;
    stationNameZh?: string;
    stationNameVi?: string;
    shift?: {
      cashierName?: string;
      from?: string;
      to?: string;
      orderCount?: number;
      totalSales?: number;
    };
    agentId?: string;
  };
};

export type PrintJobMessage = {
  jobId: string;
  printer: {
    id?: string;
    name?: string;
    ip: string;
    port: number;
    paperWidth: 58 | 80;
  };
  payload: PrintTicketPayload;
};
