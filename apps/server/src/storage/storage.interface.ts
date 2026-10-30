export type UploadedObject = {
  /** 对外可访问 URL 或路径，如 /uploads/xxx.jpg */
  url: string;
  key: string;
};

export interface StorageDriver {
  upload(file: Express.Multer.File, folder?: string): Promise<UploadedObject>;
  delete?(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
