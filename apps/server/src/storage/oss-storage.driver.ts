import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OSS from 'ali-oss';
import { randomUUID } from 'crypto';
import { BusinessError } from '../common/errors/business.error';
import { StorageDriver, UploadedObject } from './storage.interface';
import { assertAllowedImageUpload, safeImageExt } from './upload-image.util';

/**
 * 阿里云 OSS 驱动。STORAGE_DRIVER=oss 且配齐 OSS_* 时启用。
 * 公网 URL 优先 STORAGE_PUBLIC_BASE_URL / CDN_BASE_URL，否则用 bucket 默认域名。
 */
@Injectable()
export class OssStorageDriver implements StorageDriver {
  private readonly logger = new Logger(OssStorageDriver.name);
  private readonly client: OSS | null;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    const region = (config.get<string>('OSS_REGION') ?? '').trim();
    const accessKeyId = (config.get<string>('OSS_ACCESS_KEY') ?? '').trim();
    const accessKeySecret = (config.get<string>('OSS_SECRET_KEY') ?? '').trim();
    const bucket = (config.get<string>('OSS_BUCKET') ?? '').trim();

    if (region && accessKeyId && accessKeySecret && bucket) {
      this.client = new OSS({
        region,
        accessKeyId,
        accessKeySecret,
        bucket,
      });
      const cdn = (
        config.get<string>('STORAGE_PUBLIC_BASE_URL') ||
        config.get<string>('CDN_BASE_URL') ||
        ''
      )
        .trim()
        .replace(/\/$/, '');
      this.publicBase = cdn || `https://${bucket}.${region}.aliyuncs.com`;
      this.logger.log(`OSS ready bucket=${bucket} region=${region} publicBase=${this.publicBase}`);
    } else {
      this.client = null;
      this.publicBase = '';
      this.logger.warn('OSS credentials incomplete; uploads will fail when STORAGE_DRIVER=oss');
    }
  }

  async upload(file: Express.Multer.File, folder = 'dishes'): Promise<UploadedObject> {
    assertAllowedImageUpload(file);
    if (!this.client || !this.publicBase) {
      throw new BusinessError('STORAGE_OSS_NOT_CONFIGURED');
    }
    const ext = safeImageExt(file);
    const key = `${folder.replace(/^\/+|\/+$/g, '')}/${randomUUID()}${ext}`;
    try {
      await this.client.put(key, file.buffer, {
        headers: {
          'Content-Type': file.mimetype || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000',
        },
      });
    } catch (err) {
      this.logger.error(`OSS put failed key=${key}: ${(err as Error).message}`);
      throw new BusinessError('STORAGE_OSS_UPLOAD_FAILED');
    }
    return { url: `${this.publicBase}/${key}`, key };
  }
}
