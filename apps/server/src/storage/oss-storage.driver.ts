import { Injectable } from '@nestjs/common';
import { BusinessError } from '../common/errors/business.error';
import { StorageDriver, UploadedObject } from './storage.interface';
import { assertAllowedImageUpload } from './upload-image.util';

/**
 * 预留阿里云 OSS 驱动（阶段 11 再接入真实 SDK）。
 * STORAGE_DRIVER=oss 时启用。
 */
@Injectable()
export class OssStorageDriver implements StorageDriver {
  async upload(file: Express.Multer.File, _folder?: string): Promise<UploadedObject> {
    assertAllowedImageUpload(file);
    throw new BusinessError('STORAGE_OSS_NOT_CONFIGURED');
  }
}
