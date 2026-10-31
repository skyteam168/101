import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { StorageDriver, UploadedObject } from './storage.interface';
import { assertAllowedImageUpload, safeImageExt } from './upload-image.util';

/** 本地 uploads 驱动 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = config.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads');
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  async upload(file: Express.Multer.File, folder = 'dishes'): Promise<UploadedObject> {
    assertAllowedImageUpload(file);
    const dir = join(this.root, folder);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ext = safeImageExt(file);
    const key = `${folder}/${randomUUID()}${ext}`;
    const full = join(this.root, key);
    await writeFile(full, file.buffer);
    return { url: `/uploads/${key.replace(/\\/g, '/')}`, key };
  }
}
